package handler

import (
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

func (h *DepartmentHandler) memberCount(deptID string) int64 {
	var count int64
	h.db.Model(&model.User{}).Where("department_id = ?", deptID).Count(&count)
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

	// Batch-count members to avoid N+1.
	// Guard against empty slice — IN () is invalid SQL.
	countMap := make(map[string]int64)
	if len(depts) > 0 {
		deptIDs := make([]string, len(depts))
		for i, d := range depts {
			deptIDs[i] = d.ID
		}

		type countRow struct {
			DepartmentID string
			Count        int64
		}
		var counts []countRow
		h.db.Model(&model.User{}).
			Select("department_id, count(*) as count").
			Where("department_id IN ?", deptIDs).
			Group("department_id").
			Scan(&counts)

		for _, row := range counts {
			countMap[row.DepartmentID] = row.Count
		}
	}

	items := make([]model.DepartmentResponse, len(depts))
	for i, d := range depts {
		items[i] = d.ToResponse(countMap[d.ID])
	}

	response.List(c, items, total, page, pageSize)
}

// Get handles GET /api/v1/departments/:id
func (h *DepartmentHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var dept model.Department
	if err := h.db.First(&dept, "id = ?", id).Error; err != nil {
		response.NotFound(c, "department not found")
		return
	}

	response.OK(c, dept.ToResponse(h.memberCount(id)))
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

	response.Created(c, dept.ToResponse(0))
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

	response.OK(c, dept.ToResponse(h.memberCount(id)))
}

// Delete handles DELETE /api/v1/departments/:id
func (h *DepartmentHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var dept model.Department
	if err := h.db.First(&dept, "id = ?", id).Error; err != nil {
		response.NotFound(c, "department not found")
		return
	}

	if h.memberCount(id) > 0 {
		response.BadRequest(c, "cannot delete department with existing members")
		return
	}

	if err := h.db.Delete(&dept).Error; err != nil {
		response.InternalError(c, "failed to delete department")
		return
	}

	response.OK(c, nil)
}
