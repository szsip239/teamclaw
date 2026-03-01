package handler

import (
	"context"
	"encoding/json"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	gatewaySvc "github.com/szsip239/teamclaw/server/internal/service/gateway"
)

// GatewayHandler exposes gateway connection management endpoints.
type GatewayHandler struct {
	db       *gorm.DB
	enc      *crypto.Encryptor
	registry *gatewaySvc.Registry
}

// NewGatewayHandler creates a GatewayHandler.
func NewGatewayHandler(db *gorm.DB, enc *crypto.Encryptor, registry *gatewaySvc.Registry) *GatewayHandler {
	return &GatewayHandler{db: db, enc: enc, registry: registry}
}

// Status handles GET /api/v1/gateway/status
// Returns the live connection status for every instance.
func (h *GatewayHandler) Status(c *gin.Context) {
	var instances []model.Instance
	if err := h.db.Find(&instances).Error; err != nil {
		response.InternalError(c, "failed to query instances")
		return
	}

	type instanceStatus struct {
		ID            string `json:"id"`
		Name          string `json:"name"`
		GatewayURL    string `json:"gatewayUrl"`
		Connected     bool   `json:"connected"`
		Status        string `json:"status"`
		ServerVersion string `json:"serverVersion,omitempty"`
	}

	result := make([]instanceStatus, 0, len(instances))
	for _, inst := range instances {
		statusStr := "disconnected"
		if s, ok := h.registry.GetStatus(inst.ID); ok {
			statusStr = string(s)
		}
		result = append(result, instanceStatus{
			ID:            inst.ID,
			Name:          inst.Name,
			GatewayURL:    inst.GatewayURL,
			Connected:     h.registry.IsConnected(inst.ID),
			Status:        statusStr,
			ServerVersion: h.registry.GetServerVersion(inst.ID),
		})
	}

	response.OK(c, result)
}

// Connect handles POST /api/v1/gateway/:id/connect
// Manually (re-)establishes a gateway connection for the given instance.
func (h *GatewayHandler) Connect(c *gin.Context) {
	id := c.Param("id")

	var inst model.Instance
	if err := h.db.First(&inst, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return
	}

	token, err := h.enc.Decrypt(inst.GatewayToken)
	if err != nil {
		response.InternalError(c, "failed to decrypt gateway token")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	if err := h.registry.Connect(ctx, inst.ID, inst.GatewayURL, token); err != nil {
		response.ServiceUnavailable(c, "failed to connect: "+err.Error())
		return
	}

	response.OK(c, gin.H{
		"id":        inst.ID,
		"connected": true,
		"version":   h.registry.GetServerVersion(inst.ID),
	})
}

// Disconnect handles DELETE /api/v1/gateway/:id/connect
// Closes the gateway connection for the given instance.
func (h *GatewayHandler) Disconnect(c *gin.Context) {
	id := c.Param("id")
	h.registry.Disconnect(id)
	response.OK(c, nil)
}

// Proxy handles POST /api/v1/gateway/:id/request
// Forwards an arbitrary gateway method call (for debugging/admin use).
// Body: { "method": "agents.list", "params": {} }
func (h *GatewayHandler) Proxy(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Method string         `json:"method" binding:"required"`
		Params map[string]any `json:"params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request body: "+err.Error())
		return
	}

	if !h.registry.IsConnected(id) {
		response.ServiceUnavailable(c, "instance not connected to gateway")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	payload, err := h.registry.Request(ctx, id, req.Method, req.Params)
	if err != nil {
		response.InternalError(c, "gateway request failed: "+err.Error())
		return
	}

	// Decode the raw JSON into an interface{} so it's re-encoded cleanly.
	var result any
	if len(payload) > 0 {
		_ = json.Unmarshal(payload, &result)
	}

	response.OK(c, result)
}
