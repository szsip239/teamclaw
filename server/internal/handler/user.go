package handler

import (
	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// UserHandler handles user management endpoints.
type UserHandler struct {
	db *gorm.DB
}

// NewUserHandler creates a new UserHandler.
func NewUserHandler(db *gorm.DB) *UserHandler {
	return &UserHandler{db: db}
}

// ─── Request Types ─────────────────────────────────────

type CreateUserRequest struct {
	Email        string `json:"email" binding:"required,email"`
	Name         string `json:"name" binding:"required,min=1,max=100"`
	Password     string `json:"password" binding:"required,min=8"`
	Role         string `json:"role" binding:"required,oneof=SYSTEM_ADMIN DEPT_ADMIN USER"`
	DepartmentID string `json:"departmentId"`
}

type UpdateUserRequest struct {
	Name         *string `json:"name" binding:"omitempty,min=1,max=100"`
	Role         *string `json:"role" binding:"omitempty,oneof=SYSTEM_ADMIN DEPT_ADMIN USER"`
	Status       *string `json:"status" binding:"omitempty,oneof=ACTIVE DISABLED PENDING"`
	DepartmentID *string `json:"departmentId"`
	Avatar       *string `json:"avatar"`
}

// ─── Handlers ──────────────────────────────────────────

// List handles GET /api/v1/users
// @Summary List users with pagination and search
// @Tags users
// @Security BearerAuth
// @Param page query int false "Page number" default(1)
// @Param pageSize query int false "Page size" default(20)
// @Param search query string false "Search by name or email"
// @Param status query string false "Filter by status"
// @Param departmentId query string false "Filter by department"
// @Success 200 {object} response.Response{data=response.ListResponse}
// @Router /api/v1/users [get]
func (h *UserHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	search := c.Query("search")
	statusFilter := c.Query("status")
	departmentID := c.Query("departmentId")

	query := h.db.Model(&model.User{}).Preload("Department")

	// DEPT_ADMIN can only see their own department
	if isDeptAdmin(c) {
		userID := middleware.GetUserID(c)
		var currentUser model.User
		h.db.First(&currentUser, "id = ?", userID)
		if currentUser.DepartmentID != nil {
			query = query.Where("department_id = ?", *currentUser.DepartmentID)
		}
	} else if departmentID != "" {
		query = query.Where("department_id = ?", departmentID)
	}

	if statusFilter != "" {
		query = query.Where("status = ?", statusFilter)
	}

	if search != "" {
		query = query.Where("name ILIKE ? OR email ILIKE ?", "%"+search+"%", "%"+search+"%")
	}

	var total int64
	query.Count(&total)

	var users []model.User
	query.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&users)

	userResponses := make([]model.UserResponse, len(users))
	for i, u := range users {
		userResponses[i] = u.ToResponse()
	}

	response.List(c, userResponses, total, page, pageSize)
}

// Create handles POST /api/v1/users
// @Summary Create a new user
// @Tags users
// @Security BearerAuth
// @Accept json
// @Produce json
// @Param body body CreateUserRequest true "User data"
// @Success 201 {object} response.Response{data=model.UserResponse}
// @Router /api/v1/users [post]
func (h *UserHandler) Create(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Check uniqueness
	var count int64
	h.db.Model(&model.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		response.Conflict(c, "email already registered")
		return
	}

	// Validate department if provided
	if req.DepartmentID != "" {
		var dept model.Department
		if err := h.db.First(&dept, "id = ?", req.DepartmentID).Error; err != nil {
			response.BadRequest(c, "department not found")
			return
		}
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		response.InternalError(c, "failed to hash password")
		return
	}

	user := model.User{
		BaseModel:    newBaseModel(),
		Email:        req.Email,
		Name:         req.Name,
		PasswordHash: hash,
		Role:         model.Role(req.Role),
		Status:       model.UserStatusActive,
	}
	if req.DepartmentID != "" {
		user.DepartmentID = &req.DepartmentID
	}

	if err := h.db.Create(&user).Error; err != nil {
		response.InternalError(c, "failed to create user")
		return
	}

	// Reload with department
	h.db.Preload("Department").First(&user, "id = ?", user.ID)

	response.Created(c, user.ToResponse())
}

// Update handles PATCH /api/v1/users/:id
// @Summary Update a user
// @Tags users
// @Security BearerAuth
// @Param id path string true "User ID"
// @Param body body UpdateUserRequest true "Fields to update"
// @Success 200 {object} response.Response{data=model.UserResponse}
// @Router /api/v1/users/{id} [patch]
func (h *UserHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var user model.User
	if err := h.db.First(&user, "id = ?", id).Error; err != nil {
		response.NotFound(c, "user not found")
		return
	}

	var req UpdateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	updates := map[string]interface{}{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Role != nil {
		updates["role"] = *req.Role
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.DepartmentID != nil {
		if *req.DepartmentID == "" {
			updates["department_id"] = nil
		} else {
			updates["department_id"] = *req.DepartmentID
		}
	}
	if req.Avatar != nil {
		updates["avatar"] = *req.Avatar
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	h.db.Model(&user).Updates(updates)
	h.db.Preload("Department").First(&user, "id = ?", id)

	response.OK(c, user.ToResponse())
}

// Delete handles DELETE /api/v1/users/:id
// @Summary Delete a user
// @Tags users
// @Security BearerAuth
// @Param id path string true "User ID"
// @Success 200 {object} response.Response
// @Router /api/v1/users/{id} [delete]
func (h *UserHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	// Prevent self-deletion
	if id == middleware.GetUserID(c) {
		response.BadRequest(c, "cannot delete yourself")
		return
	}

	result := h.db.Delete(&model.User{}, "id = ?", id)
	if result.RowsAffected == 0 {
		response.NotFound(c, "user not found")
		return
	}

	response.OK(c, nil)
}
