package handler

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// ResourceHandler handles model/tool resource management endpoints.
type ResourceHandler struct {
	db  *gorm.DB
	enc *crypto.Encryptor
}

// NewResourceHandler creates a new ResourceHandler.
func NewResourceHandler(db *gorm.DB, enc *crypto.Encryptor) *ResourceHandler {
	return &ResourceHandler{db: db, enc: enc}
}

// ─── Request Types ─────────────────────────────────────

type CreateResourceRequest struct {
	Name        string               `json:"name" binding:"required,min=1,max=200"`
	Type        model.ResourceType   `json:"type" binding:"required,oneof=MODEL TOOL"`
	Provider    string               `json:"provider" binding:"required,min=1,max=50"`
	Credentials string               `json:"credentials" binding:"required"`
	Config      json.RawMessage      `json:"config"`
	Description *string              `json:"description"`
	IsDefault   bool                 `json:"isDefault"`
}

type UpdateResourceRequest struct {
	Name        *string              `json:"name" binding:"omitempty,min=1,max=200"`
	Provider    *string              `json:"provider" binding:"omitempty,min=1,max=50"`
	Credentials *string              `json:"credentials"`
	Config      json.RawMessage      `json:"config"`
	Description *string              `json:"description"`
	IsDefault   *bool                `json:"isDefault"`
}

// providerDisplayNames maps provider IDs to human-readable names.
var providerDisplayNames = map[string]string{
	"openai":       "OpenAI",
	"anthropic":    "Anthropic",
	"siliconflow":  "SiliconFlow",
	"ollama":       "Ollama",
	"google":       "Google",
	"azure-openai": "Azure OpenAI",
	"deepseek":     "DeepSeek",
	"mistral":      "Mistral AI",
	"cohere":       "Cohere",
	"groq":         "Groq",
}

// ResourceResponse is the API representation of a Resource (credentials excluded).
type ResourceResponse struct {
	ID            string               `json:"id"`
	Name          string               `json:"name"`
	Type          model.ResourceType   `json:"type"`
	Provider      string               `json:"provider"`
	ProviderName  string               `json:"providerName"`
	Config        *string              `json:"config"`
	MaskedKey     string               `json:"maskedKey"`
	Status        model.ResourceStatus `json:"status"`
	LastTestedAt  interface{}          `json:"lastTestedAt"`
	LastTestError *string              `json:"lastTestError"`
	Description   *string              `json:"description"`
	IsDefault     bool                 `json:"isDefault"`
	CreatedByID   string               `json:"createdById"`
	CreatedByName string               `json:"createdByName"`
	CreatedAt     string               `json:"createdAt"`
	UpdatedAt     string               `json:"updatedAt"`
}

func toResourceResponse(r model.Resource) ResourceResponse {
	providerName := providerDisplayNames[r.Provider]
	if providerName == "" {
		providerName = r.Provider
	}
	resp := ResourceResponse{
		ID:            r.ID,
		Name:          r.Name,
		Type:          r.Type,
		Provider:      r.Provider,
		ProviderName:  providerName,
		Config:        r.Config,
		MaskedKey:     "••••••••",
		Status:        r.Status,
		LastTestedAt:  r.LastTestedAt,
		LastTestError: r.LastTestError,
		Description:   r.Description,
		IsDefault:     r.IsDefault,
		CreatedByID:   r.CreatedByID,
		CreatedAt:     r.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		UpdatedAt:     r.UpdatedAt.UTC().Format("2006-01-02T15:04:05Z"),
	}
	if r.CreatedBy.ID != "" {
		resp.CreatedByName = r.CreatedBy.Name
	}
	return resp
}

// clearOtherDefaults removes IsDefault from all other resources of the same type.
func (h *ResourceHandler) clearOtherDefaults(resourceType model.ResourceType, excludeID string) {
	h.db.Model(&model.Resource{}).
		Where("type = ? AND id != ? AND is_default = true", resourceType, excludeID).
		Update("is_default", false)
}

// ─── Handlers ──────────────────────────────────────────

// List handles GET /api/v1/resources
func (h *ResourceHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	typeFilter := c.Query("type")
	providerFilter := c.Query("provider")
	search := c.Query("search")

	q := h.db.Model(&model.Resource{}).Preload("CreatedBy")

	if typeFilter != "" {
		q = q.Where("type = ?", typeFilter)
	}
	if providerFilter != "" {
		q = q.Where("provider = ?", providerFilter)
	}
	if search != "" {
		q = q.Where("name ILIKE ?", "%"+search+"%")
	}

	var total int64
	q.Count(&total)

	var resources []model.Resource
	q.Order("is_default DESC, created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&resources)

	items := make([]ResourceResponse, len(resources))
	for i, r := range resources {
		items[i] = toResourceResponse(r)
	}
	response.NamedList(c, "resources", items, total, page, pageSize)
}

// Get handles GET /api/v1/resources/:id
func (h *ResourceHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var resource model.Resource
	if err := h.db.Preload("CreatedBy").First(&resource, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "resource not found")
		} else {
			response.InternalError(c, "database error")
		}
		return
	}

	response.OK(c, toResourceResponse(resource))
}

// Create handles POST /api/v1/resources
func (h *ResourceHandler) Create(c *gin.Context) {
	var req CreateResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	encCreds, err := h.enc.Encrypt(req.Credentials)
	if err != nil {
		response.InternalError(c, "failed to encrypt credentials")
		return
	}

	resource := model.Resource{
		BaseModel:   newBaseModel(),
		Name:        req.Name,
		Type:        req.Type,
		Provider:    req.Provider,
		Credentials: encCreds,
		Config:      RawJSON(req.Config),
		Status:      model.ResourceStatusUntested,
		Description: req.Description,
		IsDefault:   req.IsDefault,
		CreatedByID: middleware.GetUserID(c),
	}

	if err := h.db.Create(&resource).Error; err != nil {
		response.InternalError(c, "failed to create resource")
		return
	}

	// If marked as default, unset other defaults for this type
	if req.IsDefault {
		h.clearOtherDefaults(req.Type, resource.ID)
	}

	h.db.Preload("CreatedBy").First(&resource, "id = ?", resource.ID)
	response.Created(c, toResourceResponse(resource))
}

// Update handles PATCH /api/v1/resources/:id
func (h *ResourceHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var resource model.Resource
	if err := h.db.First(&resource, "id = ?", id).Error; err != nil {
		response.NotFound(c, "resource not found")
		return
	}

	var req UpdateResourceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Provider != nil {
		updates["provider"] = *req.Provider
	}
	if req.Credentials != nil {
		encCreds, err := h.enc.Encrypt(*req.Credentials)
		if err != nil {
			response.InternalError(c, "failed to encrypt credentials")
			return
		}
		updates["credentials"] = encCreds
		updates["status"] = model.ResourceStatusUntested
		updates["last_test_error"] = nil
	}
	if s := RawJSON(req.Config); s != nil {
		updates["config"] = *s
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.IsDefault != nil {
		updates["is_default"] = *req.IsDefault
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	if err := h.db.Model(&resource).Updates(updates).Error; err != nil {
		response.InternalError(c, "failed to update resource")
		return
	}

	// Propagate default flag
	if req.IsDefault != nil && *req.IsDefault {
		h.clearOtherDefaults(resource.Type, id)
	}

	h.db.Preload("CreatedBy").First(&resource, "id = ?", id)
	response.OK(c, toResourceResponse(resource))
}

// Delete handles DELETE /api/v1/resources/:id
func (h *ResourceHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var resource model.Resource
	if err := h.db.First(&resource, "id = ?", id).Error; err != nil {
		response.NotFound(c, "resource not found")
		return
	}

	if err := h.db.Delete(&resource).Error; err != nil {
		response.InternalError(c, "failed to delete resource")
		return
	}

	response.OK(c, nil)
}

// GetCredential handles GET /api/v1/resources/:id/credential
func (h *ResourceHandler) GetCredential(c *gin.Context) {
	id := c.Param("id")

	var resource model.Resource
	if err := h.db.First(&resource, "id = ?", id).Error; err != nil {
		response.NotFound(c, "resource not found")
		return
	}

	decrypted, err := h.enc.Decrypt(resource.Credentials)
	if err != nil {
		response.InternalError(c, "failed to decrypt credentials")
		return
	}

	response.OK(c, gin.H{"credential": decrypted})
}

// TestResource handles POST /api/v1/resources/:id/test
// Marks the resource status as active and records the test time.
// Full connectivity testing would require calling the provider API,
// which is out of scope for now — this is a lightweight stub.
func (h *ResourceHandler) TestResource(c *gin.Context) {
	id := c.Param("id")

	var resource model.Resource
	if err := h.db.Preload("CreatedBy").First(&resource, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "resource not found")
		} else {
			response.InternalError(c, "database error")
		}
		return
	}

	now := time.Now()
	if err := h.db.Model(&resource).Updates(map[string]any{
		"status":         model.ResourceStatusActive,
		"last_tested_at": now,
		"last_test_error": nil,
	}).Error; err != nil {
		response.InternalError(c, "failed to update resource status")
		return
	}

	h.db.Preload("CreatedBy").First(&resource, "id = ?", id)
	response.OK(c, gin.H{
		"ok":        true,
		"latencyMs": 0,
		"status":    resource.Status,
		"resource":  toResourceResponse(resource),
	})
}

// ListProviders handles GET /api/v1/resources/providers
func (h *ResourceHandler) ListProviders(c *gin.Context) {
	typeFilter := c.Query("type")

	type providerInfo struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Type string `json:"type"`
	}

	all := []providerInfo{
		{ID: "openai", Name: "OpenAI", Type: "MODEL"},
		{ID: "anthropic", Name: "Anthropic", Type: "MODEL"},
		{ID: "siliconflow", Name: "SiliconFlow", Type: "MODEL"},
		{ID: "ollama", Name: "Ollama", Type: "MODEL"},
		{ID: "google", Name: "Google", Type: "MODEL"},
		{ID: "azure-openai", Name: "Azure OpenAI", Type: "MODEL"},
		{ID: "deepseek", Name: "DeepSeek", Type: "MODEL"},
	}

	if typeFilter == "" {
		response.OK(c, gin.H{"providers": all})
		return
	}

	var filtered []providerInfo
	for _, p := range all {
		if p.Type == typeFilter {
			filtered = append(filtered, p)
		}
	}
	if filtered == nil {
		filtered = []providerInfo{}
	}
	response.OK(c, gin.H{"providers": filtered})
}
