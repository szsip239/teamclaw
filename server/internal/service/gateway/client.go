package gateway

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
	"go.uber.org/zap"
)

const (
	protocolVersion       = 3
	defaultRequestTimeout = 30 * time.Second
	maxReconnectAttempts  = 10
	baseReconnectDelay    = 1 * time.Second
	maxReconnectDelay     = 32 * time.Second
	dialTimeout           = 10 * time.Second
	clientID              = "openclaw-control-ui"
	clientVersion         = "1.0.0"
)

// ConnectionStatus represents the lifecycle state of a gateway connection.
type ConnectionStatus string

const (
	StatusConnecting   ConnectionStatus = "connecting"
	StatusConnected    ConnectionStatus = "connected"
	StatusDisconnected ConnectionStatus = "disconnected"
	StatusError        ConnectionStatus = "error"
)

// EventHandler is called when the gateway pushes an event.
type EventHandler func(payload json.RawMessage)

// ── Wire frames ────────────────────────────────────────────────────────────

type gatewayFrame struct {
	Type    string          `json:"type"`             // "req" | "res" | "event"
	ID      string          `json:"id,omitempty"`     // request/response correlation ID
	Method  string          `json:"method,omitempty"` // request method
	Params  json.RawMessage `json:"params,omitempty"` // request params
	OK      bool            `json:"ok,omitempty"`     // response status
	Payload json.RawMessage `json:"payload,omitempty"` // response payload
	Event   string          `json:"event,omitempty"`  // push event name
	Error   *struct {
		Message string `json:"message"`
		Code    string `json:"code"`
	} `json:"error,omitempty"`
}

type pendingRequest struct {
	ch chan pendingResult
}

type pendingResult struct {
	payload json.RawMessage
	err     error
}

// ── Client ─────────────────────────────────────────────────────────────────

// Client manages a single persistent WebSocket connection to an OpenClaw Gateway.
// It handles the connect.challenge handshake, request/response correlation,
// event dispatch, tick-based liveness detection, and exponential-backoff reconnect.
type Client struct {
	url    string
	token  string
	logger *zap.Logger

	mu      sync.RWMutex
	writeMu sync.Mutex // gorilla/websocket writes must be serialized

	conn    *websocket.Conn
	pending map[string]*pendingRequest
	// listeners: event → subID → handler
	listeners map[string]map[int]EventHandler
	nextSubID int

	connected         bool
	intentionalClose  bool
	reconnectAttempts int

	serverVersion  string
	tickIntervalMs time.Duration
	lastTick       time.Time

	tickCancel context.CancelFunc // cancels the tick-watch goroutine

	// Callbacks set by Registry
	OnStatusChange       func(ConnectionStatus)
	OnPermanentDisconnect func()
}

// NewClient creates a new (disconnected) Client.
func NewClient(url, token string, logger *zap.Logger) *Client {
	return &Client{
		url:            url,
		token:          token,
		logger:         logger,
		pending:        make(map[string]*pendingRequest),
		listeners:      make(map[string]map[int]EventHandler),
		tickIntervalMs: 30 * time.Second,
	}
}

// Connect opens the WebSocket connection and completes the gateway handshake.
// It blocks until the handshake (connect.challenge → connect → hello-ok) finishes
// or the context is cancelled.
func (c *Client) Connect(ctx context.Context) error {
	c.mu.Lock()
	c.intentionalClose = false
	c.mu.Unlock()

	c.notifyStatus(StatusConnecting)

	// Origin header: OpenClaw checks it for ControlUI clients.
	origin := strings.NewReplacer("ws://", "http://", "wss://", "https://").Replace(c.url)

	dialer := &websocket.Dialer{HandshakeTimeout: dialTimeout}
	conn, _, err := dialer.DialContext(ctx, c.url, http.Header{"Origin": {origin}})
	if err != nil {
		return fmt.Errorf("gateway: dial %s: %w", c.url, err)
	}

	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	// connectDone is signalled by the read-loop goroutine once the handshake
	// completes (either successfully or with an error).
	connectDone := make(chan error, 1)
	go c.readLoop(conn, connectDone)

	select {
	case err := <-connectDone:
		if err != nil {
			// readLoop will clean up c.conn; no need to close here.
			return err
		}
		return nil
	case <-ctx.Done():
		// Context cancelled before handshake — mark intentional so readLoop
		// doesn't immediately try to reconnect, then close.
		c.mu.Lock()
		c.intentionalClose = true
		c.mu.Unlock()
		conn.Close()
		return fmt.Errorf("gateway: connect context done: %w", ctx.Err())
	}
}

// Disconnect cleanly shuts down the connection. No reconnect will be attempted.
func (c *Client) Disconnect() {
	c.mu.Lock()
	c.intentionalClose = true
	conn := c.conn
	c.mu.Unlock()

	c.stopTickWatch()
	if conn != nil {
		conn.Close()
	}
}

// IsConnected returns true if the gateway handshake is complete and the
// connection is alive.
func (c *Client) IsConnected() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

// ServerVersion returns the version string from the gateway hello-ok payload.
func (c *Client) ServerVersion() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.serverVersion
}

// Request sends a method request to the gateway and waits for the response.
// Returns an error if the client is not (yet) connected, or on timeout.
func (c *Client) Request(ctx context.Context, method string, params any, timeout time.Duration) (json.RawMessage, error) {
	c.mu.RLock()
	connected := c.connected
	c.mu.RUnlock()
	if !connected {
		return nil, fmt.Errorf("gateway: not connected")
	}
	return c.rawRequest(ctx, method, params, timeout)
}

// On registers an event handler and returns an unsubscribe function.
func (c *Client) On(event string, handler EventHandler) func() {
	c.mu.Lock()
	id := c.nextSubID
	c.nextSubID++
	if c.listeners[event] == nil {
		c.listeners[event] = make(map[int]EventHandler)
	}
	c.listeners[event][id] = handler
	c.mu.Unlock()

	return func() {
		c.mu.Lock()
		delete(c.listeners[event], id)
		c.mu.Unlock()
	}
}

// ── Private ────────────────────────────────────────────────────────────────

// readLoop runs in a goroutine. It reads frames from the WebSocket and dispatches
// them to pending request channels or event handlers.
// It signals connectDone exactly once when the handshake result is known.
func (c *Client) readLoop(conn *websocket.Conn, connectDone chan<- error) {
	var handshakeDone atomic.Bool

	sendConnect := func(err error) {
		if handshakeDone.CompareAndSwap(false, true) {
			// Non-blocking: Connect() may have already timed out.
			select {
			case connectDone <- err:
			default:
			}
		}
	}

	defer func() {
		conn.Close()
		c.stopTickWatch()

		// Drain pending requests
		c.mu.Lock()
		wasConnected := c.connected
		c.connected = false
		if c.conn == conn {
			c.conn = nil
		}
		for id, pr := range c.pending {
			pr.ch <- pendingResult{err: fmt.Errorf("gateway: disconnected")}
			delete(c.pending, id)
		}
		intentional := c.intentionalClose
		c.mu.Unlock()

		// If the loop exits before the handshake completed, signal failure.
		sendConnect(fmt.Errorf("gateway: connection closed before handshake"))

		if wasConnected {
			c.notifyStatus(StatusDisconnected)
		}
		if !intentional {
			c.scheduleReconnect()
		}
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}

		var frame gatewayFrame
		if err := json.Unmarshal(data, &frame); err != nil {
			c.logger.Warn("gateway: malformed frame", zap.Error(err))
			continue
		}

		switch frame.Type {
		case "event":
			if frame.Event == "connect.challenge" && !handshakeDone.Load() {
				// Kick off handshake in a separate goroutine so readLoop
				// can continue processing (the connect response comes back
				// through this same loop via handleResponse).
				go func() {
					handshakeCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
					defer cancel()
					err := c.doHandshake(handshakeCtx)
					sendConnect(err)
				}()
			} else {
				c.dispatchEvent(frame)
			}
		case "res":
			c.handleResponse(frame)
		}
	}
}

// doHandshake sends the connect request and processes the hello-ok payload.
func (c *Client) doHandshake(ctx context.Context) error {
	params := map[string]any{
		"minProtocol": protocolVersion,
		"maxProtocol": protocolVersion,
		"client": map[string]any{
			"id":       clientID,
			"version":  clientVersion,
			"platform": "linux",
			"mode":     "backend",
		},
		"auth":   map[string]any{"token": c.token},
		"scopes": []string{"operator.read", "operator.write", "operator.admin"},
		"caps":   []any{},
	}

	payload, err := c.rawRequest(ctx, "connect", params, 30*time.Second)
	if err != nil {
		return fmt.Errorf("gateway: handshake: %w", err)
	}

	var helloOk struct {
		Server struct {
			Version string `json:"version"`
		} `json:"server"`
		Policy struct {
			TickIntervalMs int64 `json:"tickIntervalMs"`
		} `json:"policy"`
	}
	_ = json.Unmarshal(payload, &helloOk)

	tickMs := time.Duration(helloOk.Policy.TickIntervalMs) * time.Millisecond
	if tickMs <= 0 {
		tickMs = 30 * time.Second
	}

	c.mu.Lock()
	c.connected = true
	c.reconnectAttempts = 0
	c.serverVersion = helloOk.Server.Version
	c.tickIntervalMs = tickMs
	c.lastTick = time.Now()
	c.mu.Unlock()

	c.startTickWatch()
	c.notifyStatus(StatusConnected)
	c.logger.Info("gateway: connected", zap.String("url", c.url), zap.String("version", helloOk.Server.Version))
	return nil
}

// rawRequest sends a request frame and waits for the response.
// Does NOT require the handshake to be complete (used for the connect method itself).
func (c *Client) rawRequest(ctx context.Context, method string, params any, timeout time.Duration) (json.RawMessage, error) {
	if timeout <= 0 {
		timeout = defaultRequestTimeout
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	id := newID()
	frame := gatewayFrame{Type: "req", ID: id, Method: method}
	if params != nil {
		b, err := json.Marshal(params)
		if err != nil {
			return nil, fmt.Errorf("gateway: marshal params: %w", err)
		}
		frame.Params = b
	}

	pr := &pendingRequest{ch: make(chan pendingResult, 1)}
	c.mu.Lock()
	c.pending[id] = pr
	c.mu.Unlock()

	if err := c.writeJSON(frame); err != nil {
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("gateway: write: %w", err)
	}

	select {
	case result := <-pr.ch:
		return result.payload, result.err
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, id)
		c.mu.Unlock()
		return nil, fmt.Errorf("gateway: request %q timed out", method)
	}
}

// handleResponse routes an incoming response frame to the matching pending request.
func (c *Client) handleResponse(frame gatewayFrame) {
	c.mu.Lock()
	pr := c.pending[frame.ID]
	delete(c.pending, frame.ID)
	c.mu.Unlock()

	if pr == nil {
		return // stale or unknown response
	}

	if frame.OK {
		pr.ch <- pendingResult{payload: frame.Payload}
	} else {
		msg := "unknown gateway error"
		code := "UNKNOWN"
		if frame.Error != nil {
			msg = frame.Error.Message
			code = frame.Error.Code
		}
		pr.ch <- pendingResult{err: fmt.Errorf("[%s] %s", code, msg)}
	}
}

// dispatchEvent routes a push event to all registered handlers.
func (c *Client) dispatchEvent(frame gatewayFrame) {
	if frame.Event == "tick" {
		c.mu.Lock()
		c.lastTick = time.Now()
		c.mu.Unlock()
	}

	c.mu.RLock()
	handlers := make([]EventHandler, 0, len(c.listeners[frame.Event]))
	for _, h := range c.listeners[frame.Event] {
		handlers = append(handlers, h)
	}
	c.mu.RUnlock()

	for _, h := range handlers {
		// Run in goroutine so a slow handler cannot block the read loop.
		h := h
		payload := frame.Payload
		go func() {
			defer func() { recover() }() // nolint:errcheck
			h(payload)
		}()
	}
}

// scheduleReconnect waits for the exponential-backoff delay then calls Connect.
func (c *Client) scheduleReconnect() {
	c.mu.Lock()
	if c.intentionalClose {
		c.mu.Unlock()
		return
	}
	if c.reconnectAttempts >= maxReconnectAttempts {
		c.mu.Unlock()
		c.notifyStatus(StatusError)
		c.logger.Error("gateway: max reconnect attempts reached", zap.String("url", c.url))
		if c.OnPermanentDisconnect != nil {
			c.OnPermanentDisconnect()
		}
		return
	}

	delay := time.Duration(math.Min(
		float64(baseReconnectDelay)*math.Pow(2, float64(c.reconnectAttempts)),
		float64(maxReconnectDelay),
	))
	c.reconnectAttempts++
	c.mu.Unlock()

	c.logger.Info("gateway: reconnecting",
		zap.String("url", c.url),
		zap.Duration("delay", delay),
		zap.Int("attempt", c.reconnectAttempts),
	)

	go func() {
		time.Sleep(delay)

		c.mu.RLock()
		intentional := c.intentionalClose
		c.mu.RUnlock()
		if intentional {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if err := c.Connect(ctx); err != nil {
			// Dial or handshake failed; readLoop may or may not have started.
			// If readLoop started but immediately died it will call scheduleReconnect
			// again. If dial failed (no readLoop), we must schedule ourselves.
			c.mu.RLock()
			conn := c.conn
			c.mu.RUnlock()
			if conn == nil {
				c.scheduleReconnect()
			}
		}
	}()
}

// startTickWatch monitors server tick events and closes the connection if the
// server goes silent for more than 2× the tick interval.
func (c *Client) startTickWatch() {
	c.mu.Lock()
	if c.tickCancel != nil {
		c.tickCancel()
	}
	tickCtx, cancel := context.WithCancel(context.Background())
	c.tickCancel = cancel
	interval := c.tickIntervalMs
	c.mu.Unlock()

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				c.mu.RLock()
				lastTick := c.lastTick
				deadline := c.tickIntervalMs * 2
				conn := c.conn
				c.mu.RUnlock()

				if !lastTick.IsZero() && conn != nil && time.Since(lastTick) > deadline {
					c.logger.Warn("gateway: tick timeout, closing connection", zap.String("url", c.url))
					conn.WriteMessage( //nolint:errcheck
						websocket.CloseMessage,
						websocket.FormatCloseMessage(4000, "tick timeout"),
					)
					conn.Close()
				}
			case <-tickCtx.Done():
				return
			}
		}
	}()
}

func (c *Client) stopTickWatch() {
	c.mu.Lock()
	if c.tickCancel != nil {
		c.tickCancel()
		c.tickCancel = nil
	}
	c.mu.Unlock()
}

func (c *Client) writeJSON(v any) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	c.mu.RLock()
	conn := c.conn
	c.mu.RUnlock()
	if conn == nil {
		return fmt.Errorf("gateway: no connection")
	}
	return conn.WriteJSON(v)
}

func (c *Client) notifyStatus(status ConnectionStatus) {
	if c.OnStatusChange != nil {
		c.OnStatusChange(status)
	}
}

// newID generates a random hex string for request correlation.
func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
