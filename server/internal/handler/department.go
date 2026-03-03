package handler

import (
	"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// DepartmentHandler handles department management endpoints.
type DepartmentHandler struct {
	db *gorm.DB
}

// NewDepartmentHandler creates a new DepartmentHandler.
func NewDepartmentHandler(db *gorm.DB) *DepartmentHandler {
	return &DepartmentHandler{db: db}
}

// ─── Request Types ─────────────────────────────────────

type CreateDepartmentRequest struct {
	Name        string  `json:"name" binding:"required,min=1,max=100"`
	Description *string `json:"description" binding:"omitempty,max=500"`
}

type UpdateDepartmentRequest struct {
	Name        *string `json:"name" binding:"omitempty,min=1,max=100"`
	Description *string `json:"description" binding:"omitempty,max=500"`
}

// ─── Helpers ───────────────────────────────────────────

func (h *DepartmentHandler) userCount(deptID string) int64 {
	var count int64
	h.db.Model(&model.User{}).Where("department_id = ?", deptID).Count(&count)
	return count
}

func (h *DepartmentHandler) accessCount(deptID string) int64 {
	var count int64
	h.db.Model(&model.InstanceAccess{}).Where("department_id = ?", deptID).Count(&count)
	return count
}

// ─── Handlers ──────────────────────────────────────────

// List handles GET /api/v1/departments
func (h *DepartmentHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	search := c.Query("search")

	query := h.db.Model(&model.Department{})
	if search != "" {
		query = query.Where("name ILIKE ?", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	var depts []model.Department
	query.Order("name ASC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&depts)

	// Batch-count members and instance accesses to avoid N+1.
	// Guard against empty slice — IN () is invalid SQL.
	userCountMap := make(map[string]int64)
	accessCountMap := make(map[string]int64)
	if len(depts) > 0 {
		deptIDs := make([]string, len(depts))
		for i, d := range depts {
			deptIDs[i] = d.ID
		}

		type countRow struct {
			DepartmentID string
			Count        int64
		}

		var userCounts []countRow
		h.db.Model(&model.User{}).
			Select("department_id, count(*) as count").
			Where("department_id IN ?", deptIDs).
			Group("department_id").
			Scan(&userCounts)
		for _, row := range userCounts {
			userCountMap[row.DepartmentID] = row.Count
		}

		var accessCounts []countRow
		h.db.Model(&model.InstanceAccess{}).
			Select("department_id, count(*) as count").
			Where("department_id IN ?", deptIDs).
			Group("department_id").
			Scan(&accessCounts)
		for _, row := range accessCounts {
			accessCountMap[row.DepartmentID] = row.Count
		}
	}

	items := make([]model.DepartmentResponse, len(depts))
	for i, d := range depts {
		items[i] = d.ToResponse(userCountMap[d.ID], accessCountMap[d.ID])
	}

	response.NamedList(c, "departments", items, total, page, pageSize)
}

// Get handles GET /api/v1/departments/:id
// Returns DepartmentDetailResponse (includes users + instanceAccess lists).
func (h *DepartmentHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var dept model.Department
	if err := h.db.First(&dept, "id = ?", id).Error; err != nil {
		response.NotFound(c, "department not found")
		return
	}

	// Load members.
	var users []model.User
	h.db.Where("department_id = ?", id).Find(&users)

	type memberRef struct {
		ID     string `json:"id"`
		Name   string `json:"name"`
		Email  string `json:"email"`
		Role   string `json:"role"`
		Status string `json:"status"`
		Avatar *string `json:"avatar"`
	}
	members := make([]memberRef, len(users))
	for i, u := range users {
		members[i] = memberRef{
			ID:     u.ID,
			Name:   u.Name,
			Email:  u.Email,
			Role:   string(u.Role),
			Status: string(u.Status),
			Avatar: u.Avatar,
		}
	}

	// Load instance accesses.
	var accesses []model.InstanceAccess
	h.db.Preload("Instance").Preload("GrantedBy").
		Where("department_id = ?", id).Find(&accesses)

	type accessRef struct {
		ID             string   `json:"id"`
		InstanceID     string   `json:"instanceId"`
		InstanceName   string   `json:"instanceName"`
		InstanceStatus string   `json:"instanceStatus"`
		AgentIDs       []string `json:"agentIds"`
		GrantedByName  string   `json:"grantedByName"`
		CreatedAt      string   `json:"createdAt"`
	}
	accessList := make([]accessRef, len(accesses))
	for i, a := range accesses {
		ar := accessRef{
			ID:         a.ID,
			InstanceID: a.InstanceID,
			AgentIDs:   []string{},
			CreatedAt:  a.CreatedAt.UTC().Format("2006-01-02T15:04:05Z"),
		}
		if a.Instance.ID != "" {
			ar.InstanceName = a.Instance.Name
			ar.InstanceStatus = string(a.Instance.Status)
		}
		if a.GrantedBy.ID != "" {
			ar.GrantedByName = a.GrantedBy.Name
		}
		if a.AgentIDs != nil && *a.AgentIDs != "" {
			_ = json.Unmarshal([]byte(*a.AgentIDs), &ar.AgentIDs)
		}
		accessList[i] = ar
	}

	base := dept.ToResponse(int64(len(members)), int64(len(accessList)))
	response.OK(c, gin.H{
		"department": gin.H{
			"id":             base.ID,
			"name":           base.Name,
			"description":    base.Description,
			"userCount":      base.UserCount,
			"accessCount":    base.AccessCount,
			"createdAt":      base.CreatedAt,
			"updatedAt":      base.UpdatedAt,
			"users":          members,
			"instanceAccess": accessList,
		},
	})
}

// Create handles POST /api/v1/departments
func (h *DepartmentHandler) Create(c *gin.Context) {
	var req CreateDepartmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	var count int64
	h.db.Model(&model.Department{}).Where("name = ?", req.Name).Count(&count)
	if count > 0 {
		response.Conflict(c, "department name already exists")
		return
	}

	dept := model.Department{
		BaseModel:   newBaseModel(),
		Name:        req.Name,
		Description: req.Description,
	}
	if err := h.db.Create(&dept).Error; err != nil {
		response.InternalError(c, "failed to create department")
		return
	}

	response.Created(c, dept.ToResponse(0, 0))
}

// Update handles PATCH /api/v1/departments/:id
func (h *DepartmentHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var dept model.Department
	if err := h.db.First(&dept, "id = ?", id).Error; err != nil {
		response.NotFound(c, "department not found")
		return
	}

	var req UpdateDepartmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		var count int64
		h.db.Model(&model.Department{}).Where("name = ? AND id != ?", *req.Name, id).Count(&count)
		if count > 0 {
			response.Conflict(c, "department name already exists")
			return
		}
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	if err := h.db.Model(&dept).Updates(updates).Error; err != nil {
		response.InternalError(c, "failed to update department")
		return
	}

	// Re-fetch to get the updated values; Updates() does not mutate the struct.
	h.db.First(&dept, "id = ?", id)

	response.OK(c, dept.ToResponse(h.userCount(id), h.accessCount(id)))
}

// Delete handles DELETE /api/v1/departments/:id
func (h *DepartmentHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var dept model.Department
	if err := h.db.First(&dept, "id = ?", id).Error; err != nil {
		response.NotFound(c, "department not found")
		return
	}

	if h.userCount(id) > 0 {
		response.BadRequest(c, "cannot delete department with existing members")
		return
	}

	if err := h.db.Delete(&dept).Error; err != nil {
		response.InternalError(c, "failed to delete department")
		return
	}

	response.OK(c, nil)
}
