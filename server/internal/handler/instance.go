package handler

import (
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/crypto"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// InstanceHandler handles instance management and access-grant endpoints.
type InstanceHandler struct {
	db  *gorm.DB
	enc *crypto.Encryptor
}

// NewInstanceHandler creates a new InstanceHandler.
func NewInstanceHandler(db *gorm.DB, enc *crypto.Encryptor) *InstanceHandler {
	return &InstanceHandler{db: db, enc: enc}
}

// ─── Request Types ─────────────────────────────────────

type CreateInstanceRequest struct {
	Name         string          `json:"name" binding:"required,min=1,max=100"`
	Description  *string         `json:"description" binding:"omitempty,max=500"`
	GatewayURL   string          `json:"gatewayUrl" binding:"required"`
	GatewayToken string          `json:"gatewayToken" binding:"required"`
	ImageName    *string         `json:"imageName" binding:"omitempty,max=200"`
	DockerConfig json.RawMessage `json:"dockerConfig"`
}

type UpdateInstanceRequest struct {
	Name         *string         `json:"name" binding:"omitempty,min=1,max=100"`
	Description  *string         `json:"description"`
	GatewayURL   *string         `json:"gatewayUrl"`
	GatewayToken *string         `json:"gatewayToken"`
	ImageName    *string         `json:"imageName"`
	DockerConfig json.RawMessage `json:"dockerConfig"`
}

type GrantAccessRequest struct {
	DepartmentID string   `json:"departmentId" binding:"required"`
	AgentIDs     []string `json:"agentIds"`
}

// ─── Helpers ───────────────────────────────────────────

// deptInstanceIDs returns instance IDs accessible to the given department.
func (h *InstanceHandler) deptInstanceIDs(deptID string) []string {
	var ids []string
	h.db.Model(&model.InstanceAccess{}).
		Where("department_id = ?", deptID).
		Pluck("instance_id", &ids)
	return ids
}

// currentUserDeptID returns the department ID of the calling user, or nil.
func (h *InstanceHandler) currentUserDeptID(c *gin.Context) *string {
	var u model.User
	h.db.First(&u, "id = ?", middleware.GetUserID(c))
	return u.DepartmentID
}

// isDeptAdmin reports whether the current user has the DEPT_ADMIN role.
func isDeptAdmin(c *gin.Context) bool {
	return model.Role(middleware.GetUserRole(c)) == model.RoleDeptAdmin
}

// ─── Handlers ──────────────────────────────────────────

// List handles GET /api/v1/instances
func (h *InstanceHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	search := c.Query("search")
	statusFilter := c.Query("status")

	query := h.db.Model(&model.Instance{}).Preload("CreatedBy")

	// DEPT_ADMIN: only see instances their department can access.
	if isDeptAdmin(c) {
		deptID := h.currentUserDeptID(c)
		if deptID == nil {
			response.List(c, []model.InstanceResponse{}, 0, page, pageSize)
			return
		}
		ids := h.deptInstanceIDs(*deptID)
		if len(ids) == 0 {
			response.List(c, []model.InstanceResponse{}, 0, page, pageSize)
			return
		}
		query = query.Where("id IN ?", ids)
	}

	if search != "" {
		query = query.Where("name ILIKE ?", "%"+search+"%")
	}
	if statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
	}

	var total int64
	query.Count(&total)

	var instances []model.Instance
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&instances)

	items := make([]model.InstanceResponse, len(instances))
	for i, inst := range instances {
		items[i] = inst.ToResponse()
	}
	response.List(c, items, total, page, pageSize)
}

// Get handles GET /api/v1/instances/:id
func (h *InstanceHandler) Get(c *gin.Context) {
	id := c.Param("id")

	// DEPT_ADMIN: verify access BEFORE loading the full record.
	// If they have no access, return Forbidden without revealing instance details.
	if isDeptAdmin(c) {
		deptID := h.currentUserDeptID(c)
		if deptID == nil {
			response.Forbidden(c, "no department access to this instance")
			return
		}
		var count int64
		h.db.Model(&model.InstanceAccess{}).
			Where("instance_id = ? AND department_id = ?", id, *deptID).
			Count(&count)
		if count == 0 {
			response.Forbidden(c, "no department access to this instance")
			return
		}
	}

	var instance model.Instance
	if err := h.db.Preload("CreatedBy").First(&instance, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return
	}

	response.OK(c, instance.ToResponse())
}

// Create handles POST /api/v1/instances
func (h *InstanceHandler) Create(c *gin.Context) {
	var req CreateInstanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	var count int64
	h.db.Model(&model.Instance{}).Where("name = ?", req.Name).Count(&count)
	if count > 0 {
		response.Conflict(c, "instance name already exists")
		return
	}

	encryptedToken, err := h.enc.Encrypt(req.GatewayToken)
	if err != nil {
		response.InternalError(c, "failed to encrypt gateway token")
		return
	}

	imageName := model.DefaultImageName
	if req.ImageName != nil {
		imageName = *req.ImageName
	}

	instance := model.Instance{
		BaseModel:    newBaseModel(),
		Name:         req.Name,
		Description:  req.Description,
		GatewayURL:   req.GatewayURL,
		GatewayToken: encryptedToken,
		ImageName:    imageName,
		DockerConfig: RawJSON(req.DockerConfig),
		Status:       model.InstanceStatusOffline,
		CreatedByID:  middleware.GetUserID(c),
	}

	if err := h.db.Create(&instance).Error; err != nil {
		response.InternalError(c, "failed to create instance")
		return
	}

	h.db.Preload("CreatedBy").First(&instance, "id = ?", instance.ID)
	response.Created(c, instance.ToResponse())
}

// Update handles PATCH /api/v1/instances/:id
func (h *InstanceHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var instance model.Instance
	if err := h.db.First(&instance, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return
	}

	var req UpdateInstanceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	updates := map[string]interface{}{}

	if req.Name != nil {
		var count int64
		h.db.Model(&model.Instance{}).Where("name = ? AND id != ?", *req.Name, id).Count(&count)
		if count > 0 {
			response.Conflict(c, "instance name already exists")
			return
		}
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.GatewayURL != nil {
		updates["gateway_url"] = *req.GatewayURL
	}
	if req.GatewayToken != nil {
		encryptedToken, err := h.enc.Encrypt(*req.GatewayToken)
		if err != nil {
			response.InternalError(c, "failed to encrypt gateway token")
			return
		}
		updates["gateway_token"] = encryptedToken
	}
	if req.ImageName != nil {
		updates["image_name"] = *req.ImageName
	}
	if s := RawJSON(req.DockerConfig); s != nil {
		updates["docker_config"] = *s
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	if err := h.db.Model(&instance).Updates(updates).Error; err != nil {
		response.InternalError(c, "failed to update instance")
		return
	}

	// Re-fetch to get updated values; Updates() does not mutate the struct.
	h.db.Preload("CreatedBy").First(&instance, "id = ?", id)
	response.OK(c, instance.ToResponse())
}

// Delete handles DELETE /api/v1/instances/:id
func (h *InstanceHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var instance model.Instance
	if err := h.db.First(&instance, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return
	}

	if instance.ContainerID != nil {
		response.BadRequest(c, "stop the container before deleting this instance")
		return
	}

	if err := h.db.Delete(&instance).Error; err != nil {
		response.InternalError(c, "failed to delete instance")
		return
	}

	response.OK(c, nil)
}

// ─── Access Management ─────────────────────────────────

// ListAccesses handles GET /api/v1/instances/:id/accesses
func (h *InstanceHandler) ListAccesses(c *gin.Context) {
	id := c.Param("id")

	if err := h.db.First(&model.Instance{}, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return
	}

	var accesses []model.InstanceAccess
	h.db.Preload("Department").Preload("GrantedBy").
		Where("instance_id = ?", id).
		Find(&accesses)

	items := make([]model.InstanceAccessResponse, len(accesses))
	for i, a := range accesses {
		items[i] = a.ToResponse()
	}
	response.OK(c, items)
}

// GrantAccess handles POST /api/v1/instances/:id/accesses
func (h *InstanceHandler) GrantAccess(c *gin.Context) {
	id := c.Param("id")

	if err := h.db.First(&model.Instance{}, "id = ?", id).Error; err != nil {
		response.NotFound(c, "instance not found")
		return
	}

	var req GrantAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	if err := h.db.First(&model.Department{}, "id = ?", req.DepartmentID).Error; err != nil {
		response.BadRequest(c, "department not found")
		return
	}

	var count int64
	h.db.Model(&model.InstanceAccess{}).
		Where("instance_id = ? AND department_id = ?", id, req.DepartmentID).
		Count(&count)
	if count > 0 {
		response.Conflict(c, "department already has access to this instance")
		return
	}

	var agentIDsPtr *string
	if len(req.AgentIDs) > 0 {
		b, err := json.Marshal(req.AgentIDs)
		if err != nil {
			response.InternalError(c, "failed to serialize agent IDs")
			return
		}
		s := string(b)
		agentIDsPtr = &s
	}

	access := model.InstanceAccess{
		BaseModel:    newBaseModel(),
		InstanceID:   id,
		DepartmentID: req.DepartmentID,
		AgentIDs:     agentIDsPtr,
		GrantedByID:  middleware.GetUserID(c),
	}

	if err := h.db.Create(&access).Error; err != nil {
		response.InternalError(c, "failed to grant access")
		return
	}

	h.db.Preload("Department").Preload("GrantedBy").First(&access, "id = ?", access.ID)
	response.Created(c, access.ToResponse())
}

// RevokeAccess handles DELETE /api/v1/instances/:id/accesses/:accessId
func (h *InstanceHandler) RevokeAccess(c *gin.Context) {
	id := c.Param("id")
	accessID := c.Param("accessId")

	var access model.InstanceAccess
	if err := h.db.First(&access, "id = ? AND instance_id = ?", accessID, id).Error; err != nil {
		response.NotFound(c, "access record not found")
		return
	}

	if err := h.db.Delete(&access).Error; err != nil {
		response.InternalError(c, "failed to revoke access")
		return
	}

	response.OK(c, nil)
}
