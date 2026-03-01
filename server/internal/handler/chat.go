package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	gatewaySvc "github.com/szsip239/teamclaw/server/internal/service/gateway"
)

// ── Handler ────────────────────────────────────────────────────────────────

// ChatHandler handles all chat-related endpoints.
type ChatHandler struct {
	db       *gorm.DB
	registry *gatewaySvc.Registry
}

// NewChatHandler creates a ChatHandler.
func NewChatHandler(db *gorm.DB, registry *gatewaySvc.Registry) *ChatHandler {
	return &ChatHandler{db: db, registry: registry}
}

// ── SSE event types ────────────────────────────────────────────────────────

// sseEvent is the JSON envelope sent over the SSE stream.
type sseEvent struct {
	Type       string          `json:"type"`
	Content    string          `json:"content,omitempty"`
	SessionID  string          `json:"sessionId,omitempty"`
	ImageURL   string          `json:"imageUrl,omitempty"`
	MimeType   string          `json:"mimeType,omitempty"`
	Alt        string          `json:"alt,omitempty"`
	ToolName   string          `json:"toolName,omitempty"`
	ToolInput  json.RawMessage `json:"toolInput,omitempty"`
	ToolOutput json.RawMessage `json:"toolOutput,omitempty"`
	Error      string          `json:"error,omitempty"`
}

// ── Gateway payload types ──────────────────────────────────────────────────

// gwContentBlock maps gateway message content blocks.
type gwContentBlock struct {
	Type     string `json:"type"` // "text" | "thinking" | "image"
	Text     string `json:"text,omitempty"`
	Thinking string `json:"thinking,omitempty"`
	Source   *struct {
		Type      string `json:"type"`
		Data      string `json:"data"`
		MediaType string `json:"media_type"`
	} `json:"source,omitempty"`
	URL string `json:"url,omitempty"`
}

// gwChatEvent is the payload of a "chat" gateway push event.
type gwChatEvent struct {
	RunID        string `json:"runId"`
	State        string `json:"state"` // "delta" | "final" | "error" | "aborted"
	ErrorMessage string `json:"errorMessage,omitempty"`
	Message      *struct {
		Content json.RawMessage `json:"content"` // string or []gwContentBlock
	} `json:"message,omitempty"`
}

// gwAgentEvent is the payload of an "agent" gateway push event.
type gwAgentEvent struct {
	RunID  string `json:"runId"`
	Stream string `json:"stream"` // "tool"
	Data   struct {
		Phase  string          `json:"phase"` // "start" | "result"
		Name   string          `json:"name"`
		Args   json.RawMessage `json:"args,omitempty"`
		Result json.RawMessage `json:"result,omitempty"`
	} `json:"data"`
}

// gwAgentsListResult is the response from agents.list.
type gwAgentsListResult struct {
	Agents    []gwAgent `json:"agents"`
	DefaultID *string   `json:"defaultId,omitempty"`
}

type gwAgent struct {
	ID     string  `json:"id"`
	Name   string  `json:"name,omitempty"`
	Status string  `json:"status,omitempty"`
	Model  string  `json:"model,omitempty"`
}

// gwHistoryResult is the response from chat.history.
type gwHistoryResult struct {
	Messages []gwHistoryMessage `json:"messages"`
}

type gwHistoryMessage struct {
	Role     string          `json:"role"` // "user" | "assistant" | "toolResult"
	Content  json.RawMessage `json:"content"`
	ToolName string          `json:"toolName,omitempty"`
}

// ── Send (SSE) ─────────────────────────────────────────────────────────────

// Send handles POST /api/v1/chat/send — SSE streaming chat.
func (h *ChatHandler) Send(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user model.User
	if err := h.db.Select("id, role, department_id, status").First(&user, "id = ?", userID).Error; err != nil {
		response.Unauthorized(c, "user not found")
		return
	}
	if user.Status != "ACTIVE" {
		response.Unauthorized(c, "user account is disabled")
		return
	}

	var req struct {
		InstanceID  string `json:"instanceId" binding:"required"`
		AgentID     string `json:"agentId" binding:"required"`
		Message     string `json:"message" binding:"required"`
		SessionID   string `json:"sessionId"` // optional: target a specific session
		Attachments []struct {
			Name     string `json:"name"`
			MimeType string `json:"mimeType"`
			Content  string `json:"content"` // base64
		} `json:"attachments"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}

	// Permission check for non-SYSTEM_ADMIN
	if user.Role != "SYSTEM_ADMIN" {
		if user.DepartmentID == nil {
			response.Forbidden(c, "no department assigned")
			return
		}
		var access model.InstanceAccess
		if err := h.db.Where("department_id = ? AND instance_id = ?", *user.DepartmentID, req.InstanceID).
			First(&access).Error; err != nil {
			response.Forbidden(c, "no access to this instance")
			return
		}
	}

	client := h.registry.GetClient(req.InstanceID)
	if client == nil || !client.IsConnected() {
		response.ServiceUnavailable(c, "instance not connected to gateway")
		return
	}

	sessionKey := fmt.Sprintf("agent:%s:tc:%s", req.AgentID, userID)
	idempotencyKey := randomHex()

	// Handle session switching if targeting a specific (possibly inactive) session
	if req.SessionID != "" {
		var target model.ChatSession
		if err := h.db.First(&target, "id = ?", req.SessionID).Error; err == nil &&
			target.UserID == userID &&
			target.InstanceID == req.InstanceID &&
			target.AgentID == req.AgentID &&
			!target.IsActive {
			if err := h.switchActiveSession(c.Request.Context(), client, userID, req.InstanceID, req.AgentID, target.ID, sessionKey); err != nil {
				// Non-fatal: log and continue
				_ = err
			}
		}
	}

	// Upsert ChatSession atomically
	chatSession := h.upsertChatSession(userID, req.InstanceID, req.AgentID, sessionKey)

	// ── Set up SSE ────────────────────────────────────────────
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")
	c.Writer.WriteHeader(http.StatusOK)

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		return
	}

	// Emit session event immediately so the client knows which session ID to track
	writeSSE(c.Writer, flusher, sseEvent{Type: "session", SessionID: chatSession.ID})

	// Event channel: gateway event goroutines → main SSE loop
	eventCh := make(chan sseEvent, 64)
	ctx := c.Request.Context()

	// Cursor tracking (must be updated only from the event goroutines, which
	// run serially per-event-type because they're writing to the buffered channel)
	var lastText, lastThinking string
	var lastImageCount int

	// Parse content blocks from a raw gateway message content field
	extractBlocks := func(raw json.RawMessage) []gwContentBlock {
		if len(raw) == 0 {
			return nil
		}
		// Try array first
		var blocks []gwContentBlock
		if err := json.Unmarshal(raw, &blocks); err == nil {
			return blocks
		}
		// Try string (plain text message)
		var s string
		if err := json.Unmarshal(raw, &s); err == nil && s != "" {
			return []gwContentBlock{{Type: "text", Text: s}}
		}
		return nil
	}

	extractText := func(blocks []gwContentBlock) string {
		var sb strings.Builder
		for _, b := range blocks {
			if b.Type == "text" && b.Text != "" {
				sb.WriteString(b.Text)
			}
		}
		return sb.String()
	}

	extractThinking := func(blocks []gwContentBlock) string {
		var sb strings.Builder
		for _, b := range blocks {
			if b.Type == "thinking" && b.Thinking != "" {
				sb.WriteString(b.Thinking)
			}
		}
		return sb.String()
	}

	// Subscribe to "chat" events
	unsubChat := client.On("chat", func(payload json.RawMessage) {
		var evt gwChatEvent
		if err := json.Unmarshal(payload, &evt); err != nil {
			return
		}
		if evt.RunID != idempotencyKey {
			return
		}

		switch evt.State {
		case "delta", "final":
			if evt.Message == nil {
				if evt.State == "final" {
					eventCh <- sseEvent{Type: "done"}
				}
				return
			}

			blocks := extractBlocks(evt.Message.Content)
			fullText := extractText(blocks)
			fullThinking := extractThinking(blocks)

			// Emit thinking delta
			if fullThinking != lastThinking {
				delta := fullThinking[len(lastThinking):]
				if delta != "" {
					eventCh <- sseEvent{Type: "thinking", Content: delta}
				}
				lastThinking = fullThinking
			}

			// Emit text delta
			if fullText != lastText {
				delta := fullText[len(lastText):]
				if delta != "" {
					eventCh <- sseEvent{Type: "text", Content: delta}
				}
				lastText = fullText
			}

			// Emit new image blocks
			var imgBlocks []gwContentBlock
			for _, b := range blocks {
				if b.Type == "image" {
					imgBlocks = append(imgBlocks, b)
				}
			}
			for i := lastImageCount; i < len(imgBlocks); i++ {
				b := imgBlocks[i]
				imgURL := b.URL
				mimeType := ""
				if b.Source != nil && b.Source.Type == "base64" {
					mimeType = b.Source.MediaType
					imgURL = fmt.Sprintf("data:%s;base64,%s", mimeType, b.Source.Data)
				}
				if imgURL != "" {
					eventCh <- sseEvent{Type: "image", ImageURL: imgURL, MimeType: mimeType}
				}
			}
			lastImageCount = len(imgBlocks)

			if evt.State == "final" {
				eventCh <- sseEvent{Type: "done"}
			}

		case "error":
			msg := evt.ErrorMessage
			if msg == "" {
				msg = "unknown gateway error"
			}
			eventCh <- sseEvent{Type: "error", Error: msg}

		case "aborted":
			eventCh <- sseEvent{Type: "error", Error: "conversation aborted"}
		}
	})

	// Subscribe to "agent" events (tool calls)
	unsubAgent := client.On("agent", func(payload json.RawMessage) {
		var evt gwAgentEvent
		if err := json.Unmarshal(payload, &evt); err != nil {
			return
		}
		if evt.RunID != idempotencyKey || evt.Stream != "tool" {
			return
		}

		switch evt.Data.Phase {
		case "start":
			eventCh <- sseEvent{
				Type:      "tool_call",
				ToolName:  evt.Data.Name,
				ToolInput: evt.Data.Args,
			}
		case "result":
			eventCh <- sseEvent{
				Type:       "tool_result",
				ToolName:   evt.Data.Name,
				ToolOutput: evt.Data.Result,
			}
		}
	})

	// Send message in background (chat.send returns after gateway accepts it;
	// actual response arrives as "chat" push events).
	sendParams := map[string]any{
		"sessionKey":     sessionKey,
		"message":        req.Message,
		"idempotencyKey": idempotencyKey,
	}
	if len(req.Attachments) > 0 {
		type attach struct {
			FileName string `json:"fileName"`
			MimeType string `json:"mimeType"`
			Content  string `json:"content"`
		}
		atts := make([]attach, len(req.Attachments))
		for i, a := range req.Attachments {
			atts[i] = attach{FileName: a.Name, MimeType: a.MimeType, Content: a.Content}
		}
		sendParams["attachments"] = atts
	}

	sendTimeout := 30 * time.Second
	if len(req.Attachments) > 0 {
		sendTimeout = 120 * time.Second
	}

	go func() {
		_, err := client.Request(context.Background(), "chat.send", sendParams, sendTimeout)
		if err != nil {
			select {
			case eventCh <- sseEvent{Type: "error", Error: "failed to send message: " + err.Error()}:
			default:
			}
		}
	}()

	// ── Main SSE loop ─────────────────────────────────────────
	cleanup := func() {
		unsubChat()
		unsubAgent()
	}
	defer cleanup()

	for {
		select {
		case evt := <-eventCh:
			writeSSE(c.Writer, flusher, evt)
			if evt.Type == "done" || evt.Type == "error" {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

// ── ListAgents ─────────────────────────────────────────────────────────────

// ListAgents handles GET /api/v1/chat/agents
// Returns all agents visible to the current user across connected instances.
func (h *ChatHandler) ListAgents(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user model.User
	if err := h.db.Select("id, role, department_id").First(&user, "id = ?", userID).Error; err != nil {
		response.InternalError(c, "user not found")
		return
	}

	// Determine accessible instance IDs
	var instanceIDs []string

	if user.Role == "SYSTEM_ADMIN" {
		var instances []model.Instance
		h.db.Where("status IN ?", []model.InstanceStatus{
			model.InstanceStatusOnline, model.InstanceStatusDegraded,
		}).Select("id").Find(&instances)
		for _, inst := range instances {
			instanceIDs = append(instanceIDs, inst.ID)
		}
	} else {
		if user.DepartmentID == nil {
			response.OK(c, gin.H{"agents": []any{}})
			return
		}
		var accesses []model.InstanceAccess
		h.db.Where("department_id = ?", *user.DepartmentID).Find(&accesses)
		for _, a := range accesses {
			var inst model.Instance
			if err := h.db.Select("id, status").First(&inst, "id = ?", a.InstanceID).Error; err != nil {
				continue
			}
			if inst.Status == model.InstanceStatusOnline || inst.Status == model.InstanceStatusDegraded {
				instanceIDs = append(instanceIDs, a.InstanceID)
			}
		}
	}

	if len(instanceIDs) == 0 {
		response.OK(c, gin.H{"agents": []any{}})
		return
	}

	// Build lookup maps
	type instInfo struct {
		Name        string
		HasContainer bool
	}
	infoMap := make(map[string]instInfo)
	var instances []model.Instance
	h.db.Where("id IN ?", instanceIDs).Select("id, name, container_id").Find(&instances)
	for _, inst := range instances {
		infoMap[inst.ID] = instInfo{
			Name:        inst.Name,
			HasContainer: inst.ContainerID != nil,
		}
	}

	type chatAgentInfo struct {
		InstanceID   string `json:"instanceId"`
		InstanceName string `json:"instanceName"`
		AgentID      string `json:"agentId"`
		AgentName    string `json:"agentName"`
		Status       string `json:"status"`
		Model        string `json:"model,omitempty"`
		Category     string `json:"category"`
		HasContainer bool   `json:"hasContainer"`
	}

	var agents []chatAgentInfo

	for _, instID := range instanceIDs {
		client := h.registry.GetClient(instID)
		if client == nil || !client.IsConnected() {
			continue
		}

		ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
		payload, err := client.Request(ctx, "agents.list", nil, 10*time.Second)
		cancel()
		if err != nil {
			continue
		}

		// agents.list may return array or {agents: []}
		var result gwAgentsListResult
		if err := json.Unmarshal(payload, &result); err != nil {
			// Try plain array
			var arr []gwAgent
			if err2 := json.Unmarshal(payload, &arr); err2 == nil {
				result.Agents = arr
			}
		}

		// Load AgentMeta for visibility filtering
		var metas []model.AgentMeta
		h.db.Where("instance_id = ?", instID).Find(&metas)
		metaMap := make(map[string]model.AgentMeta, len(metas))
		for _, m := range metas {
			metaMap[m.AgentID] = m
		}

		info := infoMap[instID]
		for _, ag := range result.Agents {
			meta, hasMeta := metaMap[ag.ID]
			category := "DEFAULT"
			if hasMeta {
				category = string(meta.Category)
				// Visibility check for non-SYSTEM_ADMIN
				if user.Role != "SYSTEM_ADMIN" && !isAgentVisibleForUser(meta, user) {
					continue
				}
			}

			name := ag.Name
			if name == "" {
				name = ag.ID
			}
			status := ag.Status
			if status == "" {
				status = "active"
			}

			agents = append(agents, chatAgentInfo{
				InstanceID:   instID,
				InstanceName: info.Name,
				AgentID:      ag.ID,
				AgentName:    name,
				Status:       status,
				Model:        ag.Model,
				Category:     category,
				HasContainer: info.HasContainer,
			})
		}
	}

	if agents == nil {
		agents = []chatAgentInfo{}
	}
	response.OK(c, gin.H{"agents": agents})
}

// isAgentVisibleForUser checks whether a user can see the given agent.
func isAgentVisibleForUser(meta model.AgentMeta, user model.User) bool {
	switch meta.Category {
	case model.AgentCategoryDefault:
		return true
	case model.AgentCategoryDepartment:
		if user.DepartmentID == nil || meta.DepartmentID == nil {
			return false
		}
		return *user.DepartmentID == *meta.DepartmentID
	case model.AgentCategoryPersonal:
		if meta.OwnerID == nil {
			return false
		}
		return user.ID == *meta.OwnerID
	default:
		return true
	}
}

// ── ListSessions ───────────────────────────────────────────────────────────

// ListSessions handles GET /api/v1/chat/sessions
// Returns all chat sessions owned by the current user.
func (h *ChatHandler) ListSessions(c *gin.Context) {
	userID := middleware.GetUserID(c)

	type sessionItem struct {
		ID            string     `json:"id"`
		InstanceID    string     `json:"instanceId"`
		InstanceName  string     `json:"instanceName"`
		AgentID       string     `json:"agentId"`
		Title         *string    `json:"title"`
		LastMessageAt *time.Time `json:"lastMessageAt"`
		MessageCount  int        `json:"messageCount"`
		IsActive      bool       `json:"isActive"`
		CreatedAt     time.Time  `json:"createdAt"`
	}

	var sessions []model.ChatSession
	if err := h.db.Preload("Instance").
		Where("user_id = ?", userID).
		Order("last_message_at DESC, created_at DESC").
		Find(&sessions).Error; err != nil {
		response.InternalError(c, "failed to query sessions")
		return
	}

	items := make([]sessionItem, 0, len(sessions))
	for _, s := range sessions {
		items = append(items, sessionItem{
			ID:            s.ID,
			InstanceID:    s.InstanceID,
			InstanceName:  s.Instance.Name,
			AgentID:       s.AgentID,
			Title:         s.Title,
			LastMessageAt: s.LastMessageAt,
			MessageCount:  s.MessageCount,
			IsActive:      s.IsActive,
			CreatedAt:     s.CreatedAt,
		})
	}

	response.OK(c, gin.H{"sessions": items})
}

// ── GetHistory ─────────────────────────────────────────────────────────────

// GetHistory handles GET /api/v1/chat/sessions/:id/history
// Returns archived snapshot batches + live messages from the gateway (if session is active).
func (h *ChatHandler) GetHistory(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var session model.ChatSession
	if err := h.db.First(&session, "id = ?", id).Error; err != nil {
		response.NotFound(c, "session not found")
		return
	}
	if session.UserID != userID {
		response.Forbidden(c, "no access to this session")
		return
	}

	// 1. Load snapshot records grouped by batchId
	var snapRows []model.ChatMessageSnapshot
	h.db.Where("chat_session_id = ?", id).
		Order("created_at ASC, order_index ASC").
		Find(&snapRows)

	type snapMessage struct {
		ID            string  `json:"id"`
		Role          string  `json:"role"`
		Content       string  `json:"content"`
		ContentBlocks *string `json:"contentBlocks,omitempty"`
		Thinking      *string `json:"thinking,omitempty"`
		ToolCalls     *string `json:"toolCalls,omitempty"`
		CreatedAt     string  `json:"createdAt"`
	}
	type snapBatch struct {
		BatchID   string        `json:"batchId"`
		CreatedAt string        `json:"createdAt"`
		Messages  []snapMessage `json:"messages"`
	}

	batchOrder := []string{}
	batchMap := map[string]*snapBatch{}
	for _, row := range snapRows {
		if _, ok := batchMap[row.BatchID]; !ok {
			batchOrder = append(batchOrder, row.BatchID)
			batchMap[row.BatchID] = &snapBatch{
				BatchID:   row.BatchID,
				CreatedAt: row.CreatedAt.Format(time.RFC3339),
				Messages:  []snapMessage{},
			}
		}
		batchMap[row.BatchID].Messages = append(batchMap[row.BatchID].Messages, snapMessage{
			ID:            row.ID,
			Role:          row.Role,
			Content:       row.Content,
			ContentBlocks: row.ContentBlocks,
			Thinking:      row.Thinking,
			ToolCalls:     row.ToolCalls,
			CreatedAt:     row.CreatedAt.Format(time.RFC3339),
		})
	}

	snapshots := make([]snapBatch, 0, len(batchOrder))
	for _, bid := range batchOrder {
		snapshots = append(snapshots, *batchMap[bid])
	}

	// 2. Load live messages from gateway (if session is active and connected)
	var currentMessages []map[string]any

	if session.IsActive {
		client := h.registry.GetClient(session.InstanceID)
		if client != nil && client.IsConnected() {
			sessionKey := fmt.Sprintf("agent:%s:tc:%s", session.AgentID, session.UserID)
			ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
			payload, err := client.Request(ctx, "chat.history", map[string]any{
				"sessionKey": sessionKey,
				"limit":      200,
			}, 15*time.Second)
			cancel()

			if err == nil {
				var hist gwHistoryResult
				if json.Unmarshal(payload, &hist) == nil {
					currentMessages = transformHistoryMessages(hist.Messages)
				}
			}
		}
	}

	if currentMessages == nil {
		currentMessages = []map[string]any{}
	}

	response.OK(c, gin.H{
		"snapshots":       snapshots,
		"currentMessages": currentMessages,
		"isActive":        session.IsActive,
	})
}

// ── ClearContext ───────────────────────────────────────────────────────────

// ClearContext handles POST /api/v1/chat/sessions/:id/clear-context
// Snapshots the current messages and resets the OpenClaw session context.
func (h *ChatHandler) ClearContext(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id := c.Param("id")

	var session model.ChatSession
	if err := h.db.First(&session, "id = ?", id).Error; err != nil {
		response.NotFound(c, "session not found")
		return
	}
	if session.UserID != userID {
		response.Forbidden(c, "no access to this session")
		return
	}
	if !session.IsActive {
		response.BadRequest(c, "session is archived, cannot clear context")
		return
	}

	client := h.registry.GetClient(session.InstanceID)
	if client == nil || !client.IsConnected() {
		response.ServiceUnavailable(c, "instance not connected to gateway")
		return
	}

	sessionKey := fmt.Sprintf("agent:%s:tc:%s", session.AgentID, session.UserID)

	if err := h.snapshotAndDeleteSession(c.Request.Context(), client, session, sessionKey, true); err != nil {
		response.ServiceUnavailable(c, "failed to clear context: "+err.Error())
		return
	}

	response.OK(c, nil)
}

// ── NewConversation ────────────────────────────────────────────────────────

// NewConversation handles POST /api/v1/chat/conversations/new
// Archives the current active session and creates a new one.
func (h *ChatHandler) NewConversation(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var req struct {
		InstanceID string `json:"instanceId" binding:"required"`
		AgentID    string `json:"agentId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}

	// Permission check
	var user model.User
	if err := h.db.Select("id, role, department_id").First(&user, "id = ?", userID).Error; err != nil {
		response.InternalError(c, "user not found")
		return
	}
	if user.Role != "SYSTEM_ADMIN" {
		if user.DepartmentID == nil {
			response.Forbidden(c, "no department assigned")
			return
		}
		var access model.InstanceAccess
		if err := h.db.Where("department_id = ? AND instance_id = ?", *user.DepartmentID, req.InstanceID).
			First(&access).Error; err != nil {
			response.Forbidden(c, "no access to this instance")
			return
		}
	}

	sessionKey := fmt.Sprintf("agent:%s:tc:%s", req.AgentID, userID)

	// Find and archive the current active session
	var activeSession model.ChatSession
	if err := h.db.Where("user_id = ? AND instance_id = ? AND agent_id = ? AND is_active = true",
		userID, req.InstanceID, req.AgentID).First(&activeSession).Error; err == nil {

		client := h.registry.GetClient(req.InstanceID)
		if client != nil && client.IsConnected() {
			// Snapshot messages and delete OpenClaw session (ignore error)
			_ = h.snapshotAndDeleteSession(c.Request.Context(), client, activeSession, sessionKey, true)
		}

		h.db.Model(&activeSession).Update("is_active", false)
	}

	// Create new active session
	newSession := model.ChatSession{
		BaseModel:  newBaseModel(),
		UserID:     userID,
		InstanceID: req.InstanceID,
		AgentID:    req.AgentID,
		SessionID:  sessionKey,
		IsActive:   true,
	}
	if err := h.db.Create(&newSession).Error; err != nil {
		response.InternalError(c, "failed to create session")
		return
	}

	var inst model.Instance
	h.db.Select("name").First(&inst, "id = ?", req.InstanceID)

	response.Created(c, gin.H{
		"session": gin.H{
			"id":            newSession.ID,
			"sessionId":     newSession.SessionID,
			"instanceId":    newSession.InstanceID,
			"instanceName":  inst.Name,
			"agentId":       newSession.AgentID,
			"title":         newSession.Title,
			"lastMessageAt": nil,
			"messageCount":  0,
			"isActive":      true,
			"createdAt":     newSession.CreatedAt,
		},
	})
}

// ── Private helpers ────────────────────────────────────────────────────────

// writeSSE formats and writes a single SSE event to the response writer.
func writeSSE(w http.ResponseWriter, flusher http.Flusher, evt sseEvent) {
	data, err := json.Marshal(evt)
	if err != nil {
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", data)
	flusher.Flush()
}

// upsertChatSession finds or creates the active ChatSession for the given user+instance+agent.
func (h *ChatHandler) upsertChatSession(userID, instanceID, agentID, sessionKey string) model.ChatSession {
	var session model.ChatSession
	now := time.Now()

	err := h.db.Where("user_id = ? AND instance_id = ? AND agent_id = ? AND is_active = true",
		userID, instanceID, agentID).First(&session).Error

	if err != nil {
		// Create new session
		session = model.ChatSession{
			BaseModel:     newBaseModel(),
			UserID:        userID,
			InstanceID:    instanceID,
			AgentID:       agentID,
			SessionID:     sessionKey,
			LastMessageAt: &now,
			MessageCount:  1,
			IsActive:      true,
		}
		h.db.Create(&session)
	} else {
		// Update existing
		h.db.Model(&session).Updates(map[string]any{
			"session_id":      sessionKey,
			"last_message_at": now,
			"message_count":   gorm.Expr("message_count + 1"),
		})
	}
	return session
}

// switchActiveSession snapshots the current active session and activates the target.
func (h *ChatHandler) switchActiveSession(ctx context.Context, client *gatewaySvc.Client,
	userID, instanceID, agentID, targetID, sessionKey string) error {

	var active model.ChatSession
	if err := h.db.Where("user_id = ? AND instance_id = ? AND agent_id = ? AND is_active = true",
		userID, instanceID, agentID).First(&active).Error; err != nil {
		return nil // no active session to switch from
	}
	if active.ID == targetID {
		return nil
	}

	// Snapshot and delete the active session's OpenClaw context
	_ = h.snapshotAndDeleteSession(ctx, client, active, sessionKey, true)

	// Deactivate old, activate target
	h.db.Model(&active).Update("is_active", false)
	h.db.Model(&model.ChatSession{}).Where("id = ?", targetID).Update("is_active", true)
	return nil
}

// snapshotAndDeleteSession fetches chat.history, stores snapshots in DB,
// optionally deletes the OpenClaw session, and auto-titles if needed.
func (h *ChatHandler) snapshotAndDeleteSession(ctx context.Context, client *gatewaySvc.Client,
	session model.ChatSession, sessionKey string, deleteSession bool) error {

	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	payload, err := client.Request(ctx, "chat.history", map[string]any{
		"sessionKey": sessionKey,
		"limit":      200,
	}, 30*time.Second)
	if err != nil {
		return err
	}

	var hist gwHistoryResult
	if err := json.Unmarshal(payload, &hist); err != nil || len(hist.Messages) == 0 {
		if deleteSession {
			_, _ = client.Request(ctx, "sessions.delete", map[string]any{"key": sessionKey}, 10*time.Second)
		}
		return nil
	}

	batchID := randomHex()
	orderIndex := 0
	var firstUserMessage string
	var snapshots []model.ChatMessageSnapshot

	type toolCallEntry struct {
		ToolName   string `json:"toolName"`
		ToolInput  any    `json:"toolInput"`
		ToolOutput string `json:"toolOutput"`
	}

	for _, msg := range hist.Messages {
		switch msg.Role {
		case "user":
			text := extractHistText(msg.Content)
			text = stripUserMetadata(text)
			if firstUserMessage == "" && text != "" {
				firstUserMessage = text
			}
			snap := model.ChatMessageSnapshot{
				ID:            model.GenerateID(),
				ChatSessionID: session.ID,
				BatchID:       batchID,
				OrderIndex:    orderIndex,
				Role:          "user",
				Content:       text,
			}
			if cb := extractHistContentBlocks(msg.Content); cb != "" {
				snap.ContentBlocks = &cb
			}
			snapshots = append(snapshots, snap)
			orderIndex++

		case "assistant":
			text := stripFinalTags(extractHistText(msg.Content))
			thinking := extractHistThinking(msg.Content)
			snap := model.ChatMessageSnapshot{
				ID:            model.GenerateID(),
				ChatSessionID: session.ID,
				BatchID:       batchID,
				OrderIndex:    orderIndex,
				Role:          "assistant",
				Content:       text,
			}
			if thinking != "" {
				snap.Thinking = &thinking
			}
			if cb := extractHistContentBlocks(msg.Content); cb != "" {
				snap.ContentBlocks = &cb
			}
			snapshots = append(snapshots, snap)
			orderIndex++

		case "toolResult":
			if len(snapshots) > 0 {
				last := &snapshots[len(snapshots)-1]
				if last.Role == "assistant" {
					tc := toolCallEntry{
						ToolName:   msg.ToolName,
						ToolOutput: extractHistText(msg.Content),
					}
					var existing []toolCallEntry
					if last.ToolCalls != nil {
						_ = json.Unmarshal([]byte(*last.ToolCalls), &existing)
					}
					existing = append(existing, tc)
					b, _ := json.Marshal(existing)
					s := string(b)
					last.ToolCalls = &s
				}
			}
		}
	}

	if len(snapshots) > 0 {
		h.db.CreateInBatches(snapshots, 50)
	}

	if session.Title == nil && firstUserMessage != "" {
		title := firstUserMessage
		if len(title) > 50 {
			title = title[:50]
		}
		h.db.Model(&session).Update("title", title)
	}

	if deleteSession {
		_, _ = client.Request(ctx, "sessions.delete", map[string]any{"key": sessionKey}, 10*time.Second)
	}

	return nil
}

// transformHistoryMessages converts raw gateway history messages into
// a frontend-friendly format for the GetHistory endpoint.
func transformHistoryMessages(raw []gwHistoryMessage) []map[string]any {
	type toolCallEntry struct {
		ToolName   string `json:"toolName"`
		ToolInput  any    `json:"toolInput"`
		ToolOutput string `json:"toolOutput"`
	}

	result := make([]map[string]any, 0, len(raw))
	for _, msg := range raw {
		switch msg.Role {
		case "user":
			text := stripUserMetadata(extractHistText(msg.Content))
			result = append(result, map[string]any{
				"id":        randomHex()[:8],
				"role":      "user",
				"content":   text,
				"createdAt": time.Now().Format(time.RFC3339),
			})
		case "assistant":
			text := stripFinalTags(extractHistText(msg.Content))
			thinking := extractHistThinking(msg.Content)
			m := map[string]any{
				"id":        randomHex()[:8],
				"role":      "assistant",
				"content":   text,
				"createdAt": time.Now().Format(time.RFC3339),
			}
			if thinking != "" {
				m["thinking"] = thinking
			}
			result = append(result, m)
		case "toolResult":
			if len(result) > 0 {
				last := result[len(result)-1]
				if last["role"] == "assistant" {
					tc := toolCallEntry{
						ToolName:   msg.ToolName,
						ToolOutput: extractHistText(msg.Content),
					}
					existing, _ := last["toolCalls"].([]toolCallEntry)
					last["toolCalls"] = append(existing, tc)
				}
			}
		}
	}
	return result
}

// ── Content parsing helpers ────────────────────────────────────────────────

// extractHistText extracts the plain text content from a gateway history message.
func extractHistText(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	// Try string
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	// Try content block array
	var blocks []gwContentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return ""
	}
	var parts []string
	for _, b := range blocks {
		if b.Type == "text" && b.Text != "" {
			parts = append(parts, b.Text)
		}
	}
	return strings.Join(parts, "\n")
}

// extractHistThinking extracts thinking content from a gateway history message.
func extractHistThinking(raw json.RawMessage) string {
	var blocks []gwContentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return ""
	}
	var parts []string
	for _, b := range blocks {
		if b.Type == "thinking" && b.Thinking != "" {
			parts = append(parts, b.Thinking)
		}
	}
	return strings.Join(parts, "\n")
}

// extractHistContentBlocks serializes image content blocks as a JSON string for DB storage.
func extractHistContentBlocks(raw json.RawMessage) string {
	var blocks []gwContentBlock
	if err := json.Unmarshal(raw, &blocks); err != nil {
		return ""
	}
	type block struct {
		Type     string `json:"type"`
		ImageURL string `json:"imageUrl,omitempty"`
		MimeType string `json:"mimeType,omitempty"`
	}
	var result []block
	for _, b := range blocks {
		if b.Type == "image" {
			imgURL := b.URL
			mimeType := ""
			if b.Source != nil && b.Source.Type == "base64" {
				mimeType = b.Source.MediaType
				imgURL = fmt.Sprintf("data:%s;base64,%s", mimeType, b.Source.Data)
			}
			if imgURL != "" {
				result = append(result, block{Type: "image", ImageURL: imgURL, MimeType: mimeType})
			}
		}
	}
	if len(result) == 0 {
		return ""
	}
	b, _ := json.Marshal(result)
	return string(b)
}

// stripUserMetadata strips the OpenClaw delivery metadata prefix from user messages.
// OpenClaw prepends "Conversation info ... [timestamp UTC]" to stored user messages.
var metadataTimestampRe = regexp.MustCompile(`\[[\w\s:+\-]+UTC\]\s*`)

func stripUserMetadata(text string) string {
	loc := metadataTimestampRe.FindStringIndex(text)
	if loc != nil {
		after := text[loc[1]:]
		if after != "" {
			return after
		}
	}
	return text
}

// stripFinalTags removes <final>...</final> wrapping from assistant messages.
var finalTagRe = regexp.MustCompile(`(?s)<final>(.*?)</final>`)

func stripFinalTags(text string) string {
	return strings.TrimSpace(finalTagRe.ReplaceAllString(text, "$1"))
}

// randomHex returns a random 32-character hex string.
func randomHex() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
