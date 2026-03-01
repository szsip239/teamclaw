package handler

import (
	"errors"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// AgentHandler handles agent metadata CRUD endpoints.
type AgentHandler struct{ db *gorm.DB }

// NewAgentHandler creates a new AgentHandler.
func NewAgentHandler(db *gorm.DB) *AgentHandler { return &AgentHandler{db: db} }

// ─── Request Types ─────────────────────────────────────

type CreateAgentRequest struct {
	InstanceID string               `json:"instanceId" binding:"required"`
	AgentID    string               `json:"agentId" binding:"required,min=1,max=100"`
	Category   model.AgentCategory  `json:"category" binding:"omitempty,oneof=DEFAULT DEPARTMENT PERSONAL"`
	DeptID     *string              `json:"departmentId"`
	OwnerID    *string              `json:"ownerId"`
}

type UpdateAgentRequest struct {
	Category model.AgentCategory `json:"category" binding:"omitempty,oneof=DEFAULT DEPARTMENT PERSONAL"`
	DeptID   *string             `json:"departmentId"`
	OwnerID  *string             `json:"ownerId"`
}

type CloneAgentRequest struct {
	SourceID   string               `json:"sourceId" binding:"required"`
	AgentID    string               `json:"agentId" binding:"required,min=1,max=100"`
	Category   model.AgentCategory  `json:"category" binding:"omitempty,oneof=DEFAULT DEPARTMENT PERSONAL"`
	DeptID     *string              `json:"departmentId"`
}

// ─── Helpers ───────────────────────────────────────────

// accessibleInstanceIDs returns the instance IDs the calling user can access.
// SYSTEM_ADMIN: all instances.
// DEPT_ADMIN / USER: only instances their department has access to.
func (h *AgentHandler) accessibleInstanceIDs(c *gin.Context) ([]string, bool) {
	role := model.Role(middleware.GetUserRole(c))
	if role == model.RoleSystemAdmin {
		return nil, true // nil means "no filter" (all instances)
	}

	// Resolve the caller's department.
	var u model.User
	if err := h.db.First(&u, "id = ?", middleware.GetUserID(c)).Error; err != nil || u.DepartmentID == nil {
		return []string{}, false
	}

	var ids []string
	h.db.Model(&model.InstanceAccess{}).
		Where("department_id = ?", *u.DepartmentID).
		Pluck("instance_id", &ids)
	return ids, len(ids) > 0
}

// ─── Handlers ──────────────────────────────────────────

// List handles GET /api/v1/agents
func (h *AgentHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	instanceID := c.Query("instanceId")
	categoryFilter := c.Query("category")

	query := h.db.Model(&model.AgentMeta{}).
		Preload("Instance").
		Preload("Department").
		Preload("Owner").
		Preload("CreatedBy")

	// Apply instance access filter for non-SYSTEM_ADMIN.
	if model.Role(middleware.GetUserRole(c)) != model.RoleSystemAdmin {
		ids, hasAccess := h.accessibleInstanceIDs(c)
		if !hasAccess {
			response.List(c, []model.AgentMetaResponse{}, 0, page, pageSize)
			return
		}
		query = query.Where("instance_id IN ?", ids)
	}

	if instanceID != "" {
		query = query.Where("instance_id = ?", instanceID)
	}
	if categoryFilter != "" {
		query = query.Where("category = ?", categoryFilter)
	}

	var total int64
	query.Count(&total)

	var agents []model.AgentMeta
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&agents)

	items := make([]model.AgentMetaResponse, len(agents))
	for i, a := range agents {
		items[i] = a.ToResponse()
	}
	response.List(c, items, total, page, pageSize)
}

// Get handles GET /api/v1/agents/:id
func (h *AgentHandler) Get(c *gin.Context) {
	id := c.Param("id")

	// Non-SYSTEM_ADMIN: verify access to the agent's instance.
	if model.Role(middleware.GetUserRole(c)) != model.RoleSystemAdmin {
		var meta model.AgentMeta
		if err := h.db.First(&meta, "id = ?", id).Error; err != nil {
			response.NotFound(c, "agent not found")
			return
		}
		ids, hasAccess := h.accessibleInstanceIDs(c)
		if !hasAccess {
			response.Forbidden(c, "no access to this agent's instance")
			return
		}
		found := false
		for _, iid := range ids {
			if iid == meta.InstanceID {
				found = true
				break
			}
		}
		if !found {
			response.Forbidden(c, "no access to this agent's instance")
			return
		}
	}

	var agent model.AgentMeta
	if err := h.db.
		Preload("Instance").
		Preload("Department").
		Preload("Owner").
		Preload("CreatedBy").
		First(&agent, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "agent not found")
		} else {
			response.InternalError(c, "database error")
		}
		return
	}

	response.OK(c, agent.ToResponse())
}

// Create handles POST /api/v1/agents
func (h *AgentHandler) Create(c *gin.Context) {
	var req CreateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Verify the instance exists.
	if err := h.db.First(&model.Instance{}, "id = ?", req.InstanceID).Error; err != nil {
		response.BadRequest(c, "instance not found")
		return
	}

	// Check for duplicate agentId on the same instance.
	var count int64
	h.db.Model(&model.AgentMeta{}).
		Where("instance_id = ? AND agent_id = ?", req.InstanceID, req.AgentID).
		Count(&count)
	if count > 0 {
		response.Conflict(c, "agent already registered on this instance")
		return
	}

	category := req.Category
	if category == "" {
		category = model.AgentCategoryDefault
	}

	agent := model.AgentMeta{
		BaseModel:    newBaseModel(),
		InstanceID:   req.InstanceID,
		AgentID:      req.AgentID,
		Category:     category,
		DepartmentID: req.DeptID,
		OwnerID:      req.OwnerID,
		CreatedByID:  middleware.GetUserID(c),
	}

	if err := h.db.Create(&agent).Error; err != nil {
		response.InternalError(c, "failed to create agent")
		return
	}

	h.db.Preload("Instance").Preload("Department").Preload("Owner").Preload("CreatedBy").
		First(&agent, "id = ?", agent.ID)
	response.Created(c, agent.ToResponse())
}

// Update handles PATCH /api/v1/agents/:id
func (h *AgentHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var agent model.AgentMeta
	if err := h.db.First(&agent, "id = ?", id).Error; err != nil {
		response.NotFound(c, "agent not found")
		return
	}

	var req UpdateAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// DEPT_ADMIN can only manage agents in their own department.
	if isDeptAdmin(c) {
		var u model.User
		h.db.First(&u, "id = ?", middleware.GetUserID(c))
		if agent.DepartmentID == nil || u.DepartmentID == nil || *agent.DepartmentID != *u.DepartmentID {
			response.Forbidden(c, "can only manage agents in your own department")
			return
		}
	}

	updates := map[string]any{}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	// Allow explicitly setting departmentId or ownerId to null by using pointer semantics.
	// A non-nil pointer means the client sent the field; set it (even if it's null).
	if req.DeptID != nil {
		updates["department_id"] = *req.DeptID
	}
	if req.OwnerID != nil {
		updates["owner_id"] = *req.OwnerID
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	if err := h.db.Model(&agent).Updates(updates).Error; err != nil {
		response.InternalError(c, "failed to update agent")
		return
	}

	// Re-fetch; Updates() does not mutate the struct.
	h.db.Preload("Instance").Preload("Department").Preload("Owner").Preload("CreatedBy").
		First(&agent, "id = ?", id)
	response.OK(c, agent.ToResponse())
}

// Delete handles DELETE /api/v1/agents/:id
func (h *AgentHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var agent model.AgentMeta
	if err := h.db.First(&agent, "id = ?", id).Error; err != nil {
		response.NotFound(c, "agent not found")
		return
	}

	if err := h.db.Delete(&agent).Error; err != nil {
		response.InternalError(c, "failed to delete agent")
		return
	}

	response.OK(c, nil)
}

// Clone handles POST /api/v1/agents/clone
// Copies an existing agent meta record with a new agentId (and optionally different category/dept).
func (h *AgentHandler) Clone(c *gin.Context) {
	var req CloneAgentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Load source record.
	var src model.AgentMeta
	if err := h.db.First(&src, "id = ?", req.SourceID).Error; err != nil {
		response.NotFound(c, "source agent not found")
		return
	}

	// Ensure new agentId is not already taken on the same instance.
	var count int64
	h.db.Model(&model.AgentMeta{}).
		Where("instance_id = ? AND agent_id = ?", src.InstanceID, req.AgentID).
		Count(&count)
	if count > 0 {
		response.Conflict(c, "agent already registered on this instance")
		return
	}

	category := req.Category
	if category == "" {
		category = src.Category
	}
	deptID := req.DeptID
	if deptID == nil {
		deptID = src.DepartmentID
	}

	clone := model.AgentMeta{
		BaseModel:    newBaseModel(),
		InstanceID:   src.InstanceID,
		AgentID:      req.AgentID,
		Category:     category,
		DepartmentID: deptID,
		OwnerID:      src.OwnerID,
		CreatedByID:  middleware.GetUserID(c),
	}

	if err := h.db.Create(&clone).Error; err != nil {
		response.InternalError(c, "failed to clone agent")
		return
	}

	h.db.Preload("Instance").Preload("Department").Preload("Owner").Preload("CreatedBy").
		First(&clone, "id = ?", clone.ID)
	response.Created(c, clone.ToResponse())
}
