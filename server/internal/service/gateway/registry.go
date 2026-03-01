package gateway

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
)

// Registry manages persistent WebSocket connections to all OpenClaw Gateway instances.
// One Client is maintained per Instance; connections survive HTTP request lifetimes
// and are shared across all concurrent HTTP handlers.
type Registry struct {
	mu      sync.RWMutex
	clients map[string]*Client // instanceID → *Client
	status  map[string]ConnectionStatus

	db     *gorm.DB
	logger *zap.Logger
	enc    *crypto.Encryptor
}

// NewRegistry creates an empty registry. Call Initialize to connect instances.
func NewRegistry(db *gorm.DB, logger *zap.Logger, enc *crypto.Encryptor) *Registry {
	return &Registry{
		clients: make(map[string]*Client),
		status:  make(map[string]ConnectionStatus),
		db:      db,
		logger:  logger,
		enc:     enc,
	}
}

// Connect opens a gateway connection for the given instance.
// If a connection already exists it is disconnected first.
func (r *Registry) Connect(ctx context.Context, instanceID, url, token string) error {
	// Disconnect stale connection if any.
	r.mu.Lock()
	if existing, ok := r.clients[instanceID]; ok {
		existing.Disconnect()
	}
	r.mu.Unlock()

	client := NewClient(url, token, r.logger.With(zap.String("instanceId", instanceID)))

	client.OnStatusChange = func(status ConnectionStatus) {
		r.mu.Lock()
		r.status[instanceID] = status
		r.mu.Unlock()
	}

	client.OnPermanentDisconnect = func() {
		// Mark instance as ERROR in DB (fire-and-forget).
		r.db.Model(&model.Instance{}).
			Where("id = ?", instanceID).
			Update("status", model.InstanceStatusError)
	}

	r.mu.Lock()
	r.clients[instanceID] = client
	r.status[instanceID] = StatusConnecting
	r.mu.Unlock()

	if err := client.Connect(ctx); err != nil {
		r.mu.Lock()
		delete(r.clients, instanceID)
		delete(r.status, instanceID)
		r.mu.Unlock()
		return fmt.Errorf("registry: connect %s: %w", instanceID, err)
	}
	return nil
}

// Disconnect closes the connection for the given instance.
func (r *Registry) Disconnect(instanceID string) {
	r.mu.Lock()
	client := r.clients[instanceID]
	delete(r.clients, instanceID)
	delete(r.status, instanceID)
	r.mu.Unlock()

	if client != nil {
		client.Disconnect()
	}
}

// GetClient returns the Client for the given instance, or nil if not connected.
func (r *Registry) GetClient(instanceID string) *Client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.clients[instanceID]
}

// IsConnected returns true if the instance has a live, authenticated connection.
func (r *Registry) IsConnected(instanceID string) bool {
	r.mu.RLock()
	client := r.clients[instanceID]
	r.mu.RUnlock()
	if client == nil {
		return false
	}
	return client.IsConnected()
}

// GetStatus returns the current connection status for the instance.
func (r *Registry) GetStatus(instanceID string) (ConnectionStatus, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.status[instanceID]
	return s, ok
}

// GetServerVersion returns the gateway version string from the hello-ok handshake.
func (r *Registry) GetServerVersion(instanceID string) string {
	r.mu.RLock()
	client := r.clients[instanceID]
	r.mu.RUnlock()
	if client == nil {
		return ""
	}
	return client.ServerVersion()
}

// GetConnectedIDs returns all instance IDs that currently have an authenticated connection.
func (r *Registry) GetConnectedIDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	ids := make([]string, 0)
	for id, client := range r.clients {
		if client.IsConnected() {
			ids = append(ids, id)
		}
	}
	return ids
}

// Request sends a method call to the gateway for the given instance.
func (r *Registry) Request(ctx context.Context, instanceID, method string, params any) (json.RawMessage, error) {
	client := r.GetClient(instanceID)
	if client == nil {
		return nil, fmt.Errorf("registry: instance %s is not connected", instanceID)
	}
	return client.Request(ctx, method, params, 0)
}

// DisconnectAll gracefully closes all open connections.
func (r *Registry) DisconnectAll() {
	r.mu.Lock()
	clients := make(map[string]*Client, len(r.clients))
	for id, c := range r.clients {
		clients[id] = c
	}
	r.clients = make(map[string]*Client)
	r.status = make(map[string]ConnectionStatus)
	r.mu.Unlock()

	for _, c := range clients {
		c.Disconnect()
	}
}

// Initialize loads all instances from the database and connects to each one.
// Instances with ERROR or OFFLINE status are also attempted — the health checker
// will promote them to ONLINE on success or keep them ERROR on failure.
// Connection errors are logged but do not abort initialization.
func (r *Registry) Initialize(ctx context.Context) {
	var instances []model.Instance
	if err := r.db.Find(&instances).Error; err != nil {
		r.logger.Error("registry: failed to load instances", zap.Error(err))
		return
	}

	var wg sync.WaitGroup
	sem := make(chan struct{}, 5) // max 5 concurrent connects

	for _, inst := range instances {
		inst := inst
		wg.Add(1)
		go func() {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			token, err := r.enc.Decrypt(inst.GatewayToken)
			if err != nil {
				r.logger.Error("registry: failed to decrypt token",
					zap.String("instanceId", inst.ID), zap.Error(err))
				return
			}

			connCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
			defer cancel()

			if err := r.Connect(connCtx, inst.ID, inst.GatewayURL, token); err != nil {
				r.logger.Warn("registry: initial connect failed",
					zap.String("instanceId", inst.ID),
					zap.String("url", inst.GatewayURL),
					zap.Error(err))
				// Downgrade ONLINE/DEGRADED → ERROR; leave ERROR/OFFLINE as-is.
				if inst.Status == model.InstanceStatusOnline || inst.Status == model.InstanceStatusDegraded {
					r.db.Model(&inst).Update("status", model.InstanceStatusError)
				}
				return
			}

			// Connection succeeded — if instance was ERROR/OFFLINE, mark DEGRADED
			// so the health checker can promote it to ONLINE on first success.
			if inst.Status == model.InstanceStatusError || inst.Status == model.InstanceStatusOffline {
				r.db.Model(&inst).Update("status", model.InstanceStatusDegraded)
			}
		}()
	}

	wg.Wait()
	r.logger.Info("registry: initialization complete",
		zap.Int("total", len(instances)),
		zap.Int("connected", len(r.GetConnectedIDs())),
	)
}
