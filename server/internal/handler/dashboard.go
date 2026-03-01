package handler

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// DashboardHandler handles dashboard statistics endpoints.
type DashboardHandler struct{ db *gorm.DB }

// NewDashboardHandler creates a new DashboardHandler.
func NewDashboardHandler(db *gorm.DB) *DashboardHandler { return &DashboardHandler{db: db} }

// ─── Response Types ────────────────────────────────────

type DashboardStats struct {
	Users     UserStats     `json:"users"`
	Instances InstanceStats `json:"instances"`
	Agents    AgentStats    `json:"agents"`
	Activity  ActivityStats `json:"activity"`
}

type UserStats struct {
	Total       int64 `json:"total"`
	Active      int64 `json:"active"`
	Disabled    int64 `json:"disabled"`
	NewThisWeek int64 `json:"newThisWeek"`
}

type InstanceStats struct {
	Total    int64 `json:"total"`
	Online   int64 `json:"online"`
	Offline  int64 `json:"offline"`
	Degraded int64 `json:"degraded"`
	Error    int64 `json:"error"`
}

type AgentStats struct {
	Total      int64 `json:"total"`
	Default    int64 `json:"default"`
	Department int64 `json:"department"`
	Personal   int64 `json:"personal"`
}

type ActivityStats struct {
	AuditLogsToday   int64            `json:"auditLogsToday"`
	AuditLogsWeek    int64            `json:"auditLogsWeek"`
	RecentActions    []RecentAction   `json:"recentActions"`
	TopResources     []ResourceCount  `json:"topResources"`
}

type RecentAction struct {
	UserName  string    `json:"userName"`
	Action    string    `json:"action"`
	Resource  string    `json:"resource"`
	Result    string    `json:"result"`
	CreatedAt time.Time `json:"createdAt"`
}

type ResourceCount struct {
	Resource string `json:"resource"`
	Count    int64  `json:"count"`
}

// ─── Handlers ──────────────────────────────────────────

// Stats handles GET /api/v1/dashboard/stats
// SYSTEM_ADMIN: platform-wide stats
// DEPT_ADMIN: scoped to own department
func (h *DashboardHandler) Stats(c *gin.Context) {
	role := model.Role(middleware.GetUserRole(c))
	isSysAdmin := role == model.RoleSystemAdmin

	// Resolve caller's dept for DEPT_ADMIN scoping
	var deptID *string
	if !isSysAdmin {
		var caller model.User
		h.db.First(&caller, "id = ?", middleware.GetUserID(c))
		deptID = caller.DepartmentID
	}

	stats := DashboardStats{}

	// ── User stats ────────────────────────────────────
	userQ := h.db.Model(&model.User{})
	if deptID != nil {
		userQ = userQ.Where("department_id = ?", *deptID)
	}
	userQ.Count(&stats.Users.Total)

	userQ.Where("status = ?", model.UserStatusActive).Count(&stats.Users.Active)
	userQ.Where("status = ?", model.UserStatusDisabled).Count(&stats.Users.Disabled)

	weekAgo := time.Now().AddDate(0, 0, -7)
	baseUserQ := h.db.Model(&model.User{})
	if deptID != nil {
		baseUserQ = baseUserQ.Where("department_id = ?", *deptID)
	}
	baseUserQ.Where("created_at >= ?", weekAgo).Count(&stats.Users.NewThisWeek)

	// ── Instance stats ────────────────────────────────
	if isSysAdmin {
		h.db.Model(&model.Instance{}).Count(&stats.Instances.Total)
		h.db.Model(&model.Instance{}).Where("status = ?", model.InstanceStatusOnline).Count(&stats.Instances.Online)
		h.db.Model(&model.Instance{}).Where("status = ?", model.InstanceStatusOffline).Count(&stats.Instances.Offline)
		h.db.Model(&model.Instance{}).Where("status = ?", model.InstanceStatusDegraded).Count(&stats.Instances.Degraded)
		h.db.Model(&model.Instance{}).Where("status = ?", model.InstanceStatusError).Count(&stats.Instances.Error)
	} else if deptID != nil {
		var accessedIDs []string
		h.db.Model(&model.InstanceAccess{}).
			Where("department_id = ?", *deptID).
			Pluck("instance_id", &accessedIDs)
		if len(accessedIDs) > 0 {
			stats.Instances.Total = int64(len(accessedIDs))
			h.db.Model(&model.Instance{}).Where("id IN ? AND status = ?", accessedIDs, model.InstanceStatusOnline).Count(&stats.Instances.Online)
			h.db.Model(&model.Instance{}).Where("id IN ? AND status = ?", accessedIDs, model.InstanceStatusOffline).Count(&stats.Instances.Offline)
			h.db.Model(&model.Instance{}).Where("id IN ? AND status = ?", accessedIDs, model.InstanceStatusDegraded).Count(&stats.Instances.Degraded)
			h.db.Model(&model.Instance{}).Where("id IN ? AND status = ?", accessedIDs, model.InstanceStatusError).Count(&stats.Instances.Error)
		}
	}

	// ── Agent stats ───────────────────────────────────
	agentQ := h.db.Model(&model.AgentMeta{})
	if deptID != nil {
		agentQ = agentQ.Where("department_id = ?", *deptID)
	}
	agentQ.Count(&stats.Agents.Total)
	agentQ.Where("category = ?", model.AgentCategoryDefault).Count(&stats.Agents.Default)
	agentQ.Where("category = ?", model.AgentCategoryDepartment).Count(&stats.Agents.Department)
	agentQ.Where("category = ?", model.AgentCategoryPersonal).Count(&stats.Agents.Personal)

	// ── Activity stats ────────────────────────────────
	auditQ := h.db.Model(&model.AuditLog{})
	if deptID != nil {
		var deptUserIDs []string
		h.db.Model(&model.User{}).Where("department_id = ?", *deptID).Pluck("id", &deptUserIDs)
		if len(deptUserIDs) > 0 {
			auditQ = auditQ.Where("user_id IN ?", deptUserIDs)
		} else {
			auditQ = auditQ.Where("1 = 0")
		}
	}

	today := time.Now().Truncate(24 * time.Hour)
	auditQ.Where("created_at >= ?", today).Count(&stats.Activity.AuditLogsToday)
	auditQ.Where("created_at >= ?", weekAgo).Count(&stats.Activity.AuditLogsWeek)

	// Recent 5 actions
	type recentRow struct {
		UserName  string    `gorm:"column:user_name"`
		Action    string    `gorm:"column:action"`
		Resource  string    `gorm:"column:resource"`
		Result    string    `gorm:"column:result"`
		CreatedAt time.Time `gorm:"column:created_at"`
	}
	var recentRows []recentRow
	recentQ := h.db.Table("audit_logs al").
		Select("u.name as user_name, al.action, al.resource, al.result, al.created_at").
		Joins("LEFT JOIN users u ON u.id = al.user_id")
	if deptID != nil {
		var deptUserIDs []string
		h.db.Model(&model.User{}).Where("department_id = ?", *deptID).Pluck("id", &deptUserIDs)
		if len(deptUserIDs) > 0 {
			recentQ = recentQ.Where("al.user_id IN ?", deptUserIDs)
		} else {
			recentQ = recentQ.Where("1 = 0")
		}
	}
	recentQ.Order("al.created_at DESC").Limit(5).Scan(&recentRows)

	stats.Activity.RecentActions = make([]RecentAction, len(recentRows))
	for i, r := range recentRows {
		stats.Activity.RecentActions[i] = RecentAction{
			UserName: r.UserName, Action: r.Action,
			Resource: r.Resource, Result: r.Result, CreatedAt: r.CreatedAt,
		}
	}

	// Top 5 resources by operation count (last 7 days)
	type resourceRow struct {
		Resource string `gorm:"column:resource"`
		Count    int64  `gorm:"column:count"`
	}
	var topRows []resourceRow
	topQ := h.db.Table("audit_logs").
		Select("resource, count(*) as count").
		Where("created_at >= ?", weekAgo).
		Group("resource").
		Order("count DESC").
		Limit(5)
	if deptID != nil {
		var deptUserIDs []string
		h.db.Model(&model.User{}).Where("department_id = ?", *deptID).Pluck("id", &deptUserIDs)
		if len(deptUserIDs) > 0 {
			topQ = topQ.Where("user_id IN ?", deptUserIDs)
		} else {
			topQ = topQ.Where("1 = 0")
		}
	}
	topQ.Scan(&topRows)

	stats.Activity.TopResources = make([]ResourceCount, len(topRows))
	for i, r := range topRows {
		stats.Activity.TopResources[i] = ResourceCount{Resource: r.Resource, Count: r.Count}
	}

	response.OK(c, stats)
}
