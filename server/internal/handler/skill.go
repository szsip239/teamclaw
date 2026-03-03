package handler

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// SkillHandler handles skill management endpoints.
type SkillHandler struct{ db *gorm.DB }

// NewSkillHandler creates a new SkillHandler.
func NewSkillHandler(db *gorm.DB) *SkillHandler { return &SkillHandler{db: db} }

// ─── Request Types ─────────────────────────────────────

type CreateSkillRequest struct {
	Slug        string               `json:"slug" binding:"required,min=1,max=200"`
	Name        string               `json:"name" binding:"required,min=1,max=200"`
	Description *string              `json:"description"`
	Emoji       *string              `json:"emoji" binding:"omitempty,max=10"`
	Homepage    *string              `json:"homepage" binding:"omitempty,max=500"`
	Category    model.SkillCategory  `json:"category" binding:"omitempty,oneof=DEFAULT DEPARTMENT PERSONAL"`
	Source      model.SkillSource    `json:"source" binding:"omitempty,oneof=LOCAL CLAWHUB"`
	ClawHubSlug *string              `json:"clawhubSlug" binding:"omitempty,max=200"`
	Version     string               `json:"version" binding:"omitempty,max=20"`
	Tags        json.RawMessage      `json:"tags"`
	Frontmatter json.RawMessage      `json:"frontmatter"`
}

type UpdateSkillRequest struct {
	Name        *string              `json:"name" binding:"omitempty,min=1,max=200"`
	Description *string              `json:"description"`
	Emoji       *string              `json:"emoji" binding:"omitempty,max=10"`
	Homepage    *string              `json:"homepage" binding:"omitempty,max=500"`
	Category    model.SkillCategory  `json:"category" binding:"omitempty,oneof=DEFAULT DEPARTMENT PERSONAL"`
	Version     *string              `json:"version" binding:"omitempty,max=20"`
	Tags        json.RawMessage      `json:"tags"`
	Frontmatter json.RawMessage      `json:"frontmatter"`
}

// skillDeptRef is a minimal department reference.
type skillDeptRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// SkillVersionResponse is the API representation of a SkillVersion.
type SkillVersionResponse struct {
	ID              string    `json:"id"`
	Version         string    `json:"version"`
	Changelog       *string   `json:"changelog"`
	PublishedByName string    `json:"publishedByName"`
	PublishedAt     time.Time `json:"publishedAt"`
}

// SkillDetailResponse extends SkillResponse with full version history.
type SkillDetailResponse struct {
	SkillResponse
	Versions []SkillVersionResponse `json:"versions"`
}

// SkillResponse is the API representation of a Skill.
type SkillResponse struct {
	ID                string               `json:"id"`
	Slug              string               `json:"slug"`
	Name              string               `json:"name"`
	Description       *string              `json:"description"`
	Emoji             *string              `json:"emoji"`
	Homepage          *string              `json:"homepage"`
	Category          model.SkillCategory  `json:"category"`
	Source            model.SkillSource    `json:"source"`
	ClawHubSlug       *string              `json:"clawhubSlug"`
	Version           string               `json:"version"`
	CreatorID         string               `json:"creatorId"`
	CreatorName       string               `json:"creatorName"`
	Tags              json.RawMessage      `json:"tags"`
	Frontmatter       *string              `json:"frontmatter"`
	InstallationCount int64                `json:"installationCount"`
	Departments       []skillDeptRef       `json:"departments"`
	CreatedAt         time.Time            `json:"createdAt"`
	UpdatedAt         time.Time            `json:"updatedAt"`
}

func toSkillResponse(s model.Skill, installCount int64) SkillResponse {
	// Convert stored JSONB *string → json.RawMessage so frontend receives []
	tags := json.RawMessage("[]")
	if s.Tags != nil && *s.Tags != "" {
		tags = json.RawMessage(*s.Tags)
	}

	r := SkillResponse{
		ID:                s.ID,
		Slug:              s.Slug,
		Name:              s.Name,
		Description:       s.Description,
		Emoji:             s.Emoji,
		Homepage:          s.Homepage,
		Category:          s.Category,
		Source:            s.Source,
		ClawHubSlug:       s.ClawHubSlug,
		Version:           s.Version,
		CreatorID:         s.CreatorID,
		Tags:              tags,
		Frontmatter:       s.Frontmatter,
		InstallationCount: installCount,
		Departments:       []skillDeptRef{},
		CreatedAt:         s.CreatedAt,
		UpdatedAt:         s.UpdatedAt,
	}
	if s.Creator.ID != "" {
		r.CreatorName = s.Creator.Name
	}
	return r
}

// ─── Handlers ──────────────────────────────────────────

// List handles GET /api/v1/skills
func (h *SkillHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	search := c.Query("search")
	categoryFilter := c.Query("category")
	sourceFilter := c.Query("source")

	q := h.db.Model(&model.Skill{}).Preload("Creator")

	// PERSONAL skills: USER sees only their own; DEPT_ADMIN sees dept + own;
	// SYSTEM_ADMIN sees all
	role := model.Role(middleware.GetUserRole(c))
	userID := middleware.GetUserID(c)

	switch role {
	case model.RoleUser:
		// Own personal skills + all DEFAULT skills
		q = q.Where("category = ? OR (category = ? AND creator_id = ?)",
			model.SkillCategoryDefault, model.SkillCategoryPersonal, userID)
	case model.RoleDeptAdmin:
		// DEFAULT + DEPARTMENT (any) + own PERSONAL
		q = q.Where("category IN ? OR (category = ? AND creator_id = ?)",
			[]model.SkillCategory{model.SkillCategoryDefault, model.SkillCategoryDepartment},
			model.SkillCategoryPersonal, userID)
	// SYSTEM_ADMIN: no filter
	}

	if search != "" {
		q = q.Where("name ILIKE ? OR slug ILIKE ?", "%"+search+"%", "%"+search+"%")
	}
	if categoryFilter != "" {
		q = q.Where("category = ?", categoryFilter)
	}
	if sourceFilter != "" {
		q = q.Where("source = ?", sourceFilter)
	}

	var total int64
	q.Count(&total)

	var skills []model.Skill
	q.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&skills)

	// Batch-count installations to avoid N+1.
	installCountMap := make(map[string]int64)
	if len(skills) > 0 {
		skillIDs := make([]string, len(skills))
		for i, s := range skills {
			skillIDs[i] = s.ID
		}
		type countRow struct {
			SkillID string
			Count   int64
		}
		var rows []countRow
		h.db.Model(&model.SkillInstallation{}).
			Select("skill_id, count(*) as count").
			Where("skill_id IN ?", skillIDs).
			Group("skill_id").
			Scan(&rows)
		for _, row := range rows {
			installCountMap[row.SkillID] = row.Count
		}
	}

	items := make([]SkillResponse, len(skills))
	for i, s := range skills {
		items[i] = toSkillResponse(s, installCountMap[s.ID])
	}
	response.NamedList(c, "skills", items, total, page, pageSize)
}

// Get handles GET /api/v1/skills/:id
func (h *SkillHandler) Get(c *gin.Context) {
	id := c.Param("id")

	var skill model.Skill
	if err := h.db.Preload("Creator").First(&skill, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.NotFound(c, "skill not found")
		} else {
			response.InternalError(c, "database error")
		}
		return
	}

	var versionModels []model.SkillVersion
	h.db.Preload("PublishedBy").
		Where("skill_id = ?", id).
		Order("published_at DESC").
		Find(&versionModels)

	versions := make([]SkillVersionResponse, len(versionModels))
	for i, v := range versionModels {
		versions[i] = SkillVersionResponse{
			ID:          v.ID,
			Version:     v.Version,
			Changelog:   v.Changelog,
			PublishedAt: v.PublishedAt,
		}
		if v.PublishedBy.ID != "" {
			versions[i].PublishedByName = v.PublishedBy.Name
		}
	}

	var installCount int64
	h.db.Model(&model.SkillInstallation{}).Where("skill_id = ?", id).Count(&installCount)

	response.OK(c, SkillDetailResponse{
		SkillResponse: toSkillResponse(skill, installCount),
		Versions:      versions,
	})
}

// Create handles POST /api/v1/skills
func (h *SkillHandler) Create(c *gin.Context) {
	var req CreateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	var count int64
	h.db.Model(&model.Skill{}).Where("slug = ?", req.Slug).Count(&count)
	if count > 0 {
		response.Conflict(c, "skill slug already exists")
		return
	}

	category := req.Category
	if category == "" {
		category = model.SkillCategoryDefault
	}
	source := req.Source
	if source == "" {
		source = model.SkillSourceLocal
	}
	version := req.Version
	if version == "" {
		version = "0.1.0"
	}

	skill := model.Skill{
		BaseModel:   newBaseModel(),
		Slug:        req.Slug,
		Name:        req.Name,
		Description: req.Description,
		Emoji:       req.Emoji,
		Homepage:    req.Homepage,
		Category:    category,
		Source:      source,
		ClawHubSlug: req.ClawHubSlug,
		Version:     version,
		CreatorID:   middleware.GetUserID(c),
		Tags:        RawJSON(req.Tags),
		Frontmatter: RawJSON(req.Frontmatter),
	}

	if err := h.db.Create(&skill).Error; err != nil {
		response.InternalError(c, "failed to create skill")
		return
	}

	h.db.Preload("Creator").First(&skill, "id = ?", skill.ID)
	response.Created(c, toSkillResponse(skill, 0))
}

// Update handles PATCH /api/v1/skills/:id
func (h *SkillHandler) Update(c *gin.Context) {
	id := c.Param("id")

	var skill model.Skill
	if err := h.db.First(&skill, "id = ?", id).Error; err != nil {
		response.NotFound(c, "skill not found")
		return
	}

	// Only SYSTEM_ADMIN or the creator can update
	userID := middleware.GetUserID(c)
	if model.Role(middleware.GetUserRole(c)) != model.RoleSystemAdmin && skill.CreatorID != userID {
		response.Forbidden(c, "only the creator or admin can update this skill")
		return
	}

	var req UpdateSkillRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Emoji != nil {
		updates["emoji"] = *req.Emoji
	}
	if req.Homepage != nil {
		updates["homepage"] = *req.Homepage
	}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Version != nil {
		updates["version"] = *req.Version
	}
	if s := RawJSON(req.Tags); s != nil {
		updates["tags"] = *s
	}
	if s := RawJSON(req.Frontmatter); s != nil {
		updates["frontmatter"] = *s
	}

	if len(updates) == 0 {
		response.BadRequest(c, "no fields to update")
		return
	}

	if err := h.db.Model(&skill).Updates(updates).Error; err != nil {
		response.InternalError(c, "failed to update skill")
		return
	}

	h.db.Preload("Creator").First(&skill, "id = ?", id)
	var installCount int64
	h.db.Model(&model.SkillInstallation{}).Where("skill_id = ?", id).Count(&installCount)
	response.OK(c, toSkillResponse(skill, installCount))
}

// Delete handles DELETE /api/v1/skills/:id
func (h *SkillHandler) Delete(c *gin.Context) {
	id := c.Param("id")

	var skill model.Skill
	if err := h.db.First(&skill, "id = ?", id).Error; err != nil {
		response.NotFound(c, "skill not found")
		return
	}

	// Only SYSTEM_ADMIN or creator can delete
	userID := middleware.GetUserID(c)
	if model.Role(middleware.GetUserRole(c)) != model.RoleSystemAdmin && skill.CreatorID != userID {
		response.Forbidden(c, "only the creator or admin can delete this skill")
		return
	}

	if err := h.db.Delete(&skill).Error; err != nil {
		response.InternalError(c, "failed to delete skill")
		return
	}

	response.OK(c, nil)
}
