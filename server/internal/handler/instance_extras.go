package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	gatewaySvc "github.com/szsip239/teamclaw/server/internal/service/gateway"
)

// InstanceExtrasHandler handles extended instance endpoints that require gateway access.
type InstanceExtrasHandler struct {
	db       *gorm.DB
	enc      *crypto.Encryptor
	registry *gatewaySvc.Registry
}

// NewInstanceExtrasHandler creates a new InstanceExtrasHandler.
func NewInstanceExtrasHandler(db *gorm.DB, enc *crypto.Encryptor, registry *gatewaySvc.Registry) *InstanceExtrasHandler {
	return &InstanceExtrasHandler{db: db, enc: enc, registry: registry}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (h *InstanceExtrasHandler) findInstance(c *gin.Context) (model.Instance, bool) {
	id := c.Param("id")
	var inst model.Instance
	if err := h.db.First(&inst, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return model.Instance{}, false
	}
	return inst, true
}

func (h *InstanceExtrasHandler) connectedClient(c *gin.Context, instanceID string) *gatewaySvc.Client {
	client := h.registry.GetClient(instanceID)
	if client == nil || !client.IsConnected() {
		response.ServiceUnavailable(c, "instance gateway is not connected")
		return nil
	}
	return client
}

// wsURLToHTTP converts ws:// → http:// and wss:// → https://.
func wsURLToHTTP(wsURL string) string {
	switch {
	case strings.HasPrefix(wsURL, "wss://"):
		return "https://" + wsURL[len("wss://"):]
	case strings.HasPrefix(wsURL, "ws://"):
		return "http://" + wsURL[len("ws://"):]
	default:
		return wsURL
	}
}

// ── Handlers ─────────────────────────────────────────────────────────────────

// GetHealth handles GET /api/v1/instances/:id/health
func (h *InstanceExtrasHandler) GetHealth(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}

	now := time.Now()
	client := h.registry.GetClient(inst.ID)

	if client == nil || !client.IsConnected() {
		response.OK(c, gin.H{
			"status":     "disconnected",
			"instanceId": inst.ID,
			"checkedAt":  now,
		})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	payload, err := client.Request(ctx, "system.info", nil, 10*time.Second)
	if err != nil {
		response.OK(c, gin.H{
			"status":     "connected",
			"instanceId": inst.ID,
			"version":    inst.Version,
			"checkedAt":  now,
		})
		return
	}

	var info map[string]any
	_ = json.Unmarshal(payload, &info)

	response.OK(c, gin.H{
		"status":     "connected",
		"instanceId": inst.ID,
		"info":       info,
		"version":    inst.Version,
		"checkedAt":  now,
	})
}

// GetDashboard handles GET /api/v1/instances/:id/dashboard
func (h *InstanceExtrasHandler) GetDashboard(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}

	token, err := h.enc.Decrypt(inst.GatewayToken)
	if err != nil {
		response.InternalError(c, "failed to decrypt gateway token")
		return
	}

	response.OK(c, gin.H{
		"dashboardUrl": wsURLToHTTP(inst.GatewayURL),
		"token":        token,
	})
}

// GetSchema handles GET /api/v1/instances/:id/schema
func (h *InstanceExtrasHandler) GetSchema(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}
	client := h.connectedClient(c, inst.ID)
	if client == nil {
		return
	}

	type schemaResult struct {
		Schema  map[string]any `json:"schema"`
		UIHints map[string]any `json:"uiHints"`
		Version string         `json:"version"`
	}
	type configResult struct {
		Config map[string]any `json:"config"`
		Hash   string         `json:"hash"`
	}

	type chanResult[T any] struct {
		data T
		err  error
	}

	schemaCh := make(chan chanResult[schemaResult], 1)
	configCh := make(chan chanResult[configResult], 1)
	ctx := c.Request.Context()

	go func() {
		reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		p, err := client.Request(reqCtx, "config.schema", nil, 15*time.Second)
		if err != nil {
			schemaCh <- chanResult[schemaResult]{err: err}
			return
		}
		var sr schemaResult
		_ = json.Unmarshal(p, &sr)
		schemaCh <- chanResult[schemaResult]{data: sr}
	}()

	go func() {
		reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		p, err := client.Request(reqCtx, "config.get", nil, 15*time.Second)
		if err != nil {
			configCh <- chanResult[configResult]{err: err}
			return
		}
		var cr configResult
		_ = json.Unmarshal(p, &cr)
		configCh <- chanResult[configResult]{data: cr}
	}()

	schemaRes := <-schemaCh
	configRes := <-configCh

	if schemaRes.err != nil {
		response.InternalError(c, "failed to fetch config schema: "+schemaRes.err.Error())
		return
	}
	if configRes.err != nil {
		response.InternalError(c, "failed to fetch config: "+configRes.err.Error())
		return
	}

	response.OK(c, gin.H{
		"schema":  schemaRes.data.Schema,
		"uiHints": schemaRes.data.UIHints,
		"version": schemaRes.data.Version,
		"config":  configRes.data.Config,
		"hash":    configRes.data.Hash,
	})
}

// GetConfig handles GET /api/v1/instances/:id/config
func (h *InstanceExtrasHandler) GetConfig(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}
	client := h.connectedClient(c, inst.ID)
	if client == nil {
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	payload, err := client.Request(ctx, "config.get", nil, 15*time.Second)
	if err != nil {
		response.InternalError(c, "failed to fetch config: "+err.Error())
		return
	}

	var result map[string]any
	if err := json.Unmarshal(payload, &result); err != nil {
		response.InternalError(c, "failed to parse config response")
		return
	}
	response.OK(c, result)
}

// UpdateConfig handles PUT /api/v1/instances/:id/config
func (h *InstanceExtrasHandler) UpdateConfig(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}
	client := h.connectedClient(c, inst.ID)
	if client == nil {
		return
	}

	var body json.RawMessage
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	if _, err := client.Request(ctx, "config.set", map[string]json.RawMessage{"config": body}, 30*time.Second); err != nil {
		response.InternalError(c, "failed to update config: "+err.Error())
		return
	}
	response.OK(c, gin.H{"ok": true})
}

// ConfigPatch handles POST /api/v1/instances/:id/config-patch
func (h *InstanceExtrasHandler) ConfigPatch(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}
	client := h.connectedClient(c, inst.ID)
	if client == nil {
		return
	}

	var req struct {
		Patch    json.RawMessage `json:"patch"`
		BaseHash string          `json:"baseHash"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	payload, err := client.Request(ctx, "config.patch", map[string]any{
		"patch":    req.Patch,
		"baseHash": req.BaseHash,
	}, 30*time.Second)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "conflict") {
			c.JSON(http.StatusConflict, gin.H{"code": 409, "message": err.Error()})
			return
		}
		response.InternalError(c, "failed to apply config patch: "+err.Error())
		return
	}

	var result map[string]any
	if err := json.Unmarshal(payload, &result); err != nil {
		response.InternalError(c, "failed to parse patch response")
		return
	}
	response.OK(c, result)
}

// GetAgentDefaults handles GET /api/v1/instances/:id/agent-defaults
func (h *InstanceExtrasHandler) GetAgentDefaults(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}
	client := h.connectedClient(c, inst.ID)
	if client == nil {
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	payload, err := client.Request(ctx, "config.get", nil, 15*time.Second)
	if err != nil {
		response.InternalError(c, "failed to fetch config: "+err.Error())
		return
	}

	var result struct {
		Config map[string]any `json:"config"`
		Hash   string         `json:"hash"`
	}
	if err := json.Unmarshal(payload, &result); err != nil {
		response.InternalError(c, "failed to parse config response")
		return
	}

	var defaults any
	if agents, ok := result.Config["agents"]; ok {
		if agentsMap, ok := agents.(map[string]any); ok {
			defaults = agentsMap["defaults"]
		}
	}

	response.OK(c, gin.H{"defaults": defaults, "hash": result.Hash})
}

// UpdateAgentDefaults handles PUT /api/v1/instances/:id/agent-defaults
func (h *InstanceExtrasHandler) UpdateAgentDefaults(c *gin.Context) {
	inst, ok := h.findInstance(c)
	if !ok {
		return
	}
	client := h.connectedClient(c, inst.ID)
	if client == nil {
		return
	}

	var body json.RawMessage
	if err := c.ShouldBindJSON(&body); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}

	// Fetch current hash for optimistic concurrency.
	getCtx, getCancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer getCancel()

	getPayload, err := client.Request(getCtx, "config.get", nil, 15*time.Second)
	if err != nil {
		response.InternalError(c, "failed to fetch current config: "+err.Error())
		return
	}

	var current struct {
		Hash string `json:"hash"`
	}
	_ = json.Unmarshal(getPayload, &current)

	patchCtx, patchCancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer patchCancel()

	if _, err := client.Request(patchCtx, "config.patch", map[string]any{
		"patch":    map[string]any{"agents": map[string]any{"defaults": body}},
		"baseHash": current.Hash,
	}, 30*time.Second); err != nil {
		response.InternalError(c, "failed to update agent defaults: "+err.Error())
		return
	}
	response.OK(c, gin.H{"ok": true})
}
