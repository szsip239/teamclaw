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

type DashboardFlatStats struct {
	TotalInstances  int64 `json:"totalInstances"`
	OnlineInstances int64 `json:"onlineInstances"`
	TotalUsers      int64 `json:"totalUsers"`
	ActiveUsers     int64 `json:"activeUsers"`
	TotalSessions   int64 `json:"totalSessions"`
	TotalResources  int64 `json:"totalResources"`
	TotalSkills     int64 `json:"totalSkills"`
}

type DashboardInstanceHealth struct {
	ID              string     `json:"id"`
	Name            string     `json:"name"`
	Status          string     `json:"status"`
	Version         *string    `json:"version"`
	AgentCount      int64      `json:"agentCount"`
	SessionCount    int64      `json:"sessionCount"`
	LastHealthCheck *time.Time `json:"lastHealthCheck"`
}

type DashboardProviderDist struct {
	Provider     string `json:"provider"`
	ProviderName string `json:"providerName"`
	Count        int64  `json:"count"`
}

type DashboardRecentActivity struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	UserName   string    `json:"userName"`
	Action     string    `json:"action"`
	Resource   string    `json:"resource"`
	ResourceID *string   `json:"resourceId"`
	Result     string    `json:"result"`
	CreatedAt  time.Time `json:"createdAt"`
}

type DashboardResponse struct {
	Stats                DashboardFlatStats        `json:"stats"`
	InstanceHealth       []DashboardInstanceHealth `json:"instanceHealth"`
	ProviderDistribution []DashboardProviderDist   `json:"providerDistribution"`
	RecentActivity       []DashboardRecentActivity `json:"recentActivity"`
}

// ─── Handlers ──────────────────────────────────────────

// Stats handles GET /api/v1/dashboard
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

	resp := DashboardResponse{
		InstanceHealth:       []DashboardInstanceHealth{},
		ProviderDistribution: []DashboardProviderDist{},
		RecentActivity:       []DashboardRecentActivity{},
	}

	// ── Flat stats ────────────────────────────────────

	// User counts
	userQ := h.db.Model(&model.User{})
	if deptID != nil {
		userQ = userQ.Where("department_id = ?", *deptID)
	}
	userQ.Count(&resp.Stats.TotalUsers)

	activeQ := h.db.Model(&model.User{}).Where("status = ?", model.UserStatusActive)
	if deptID != nil {
		activeQ = activeQ.Where("department_id = ?", *deptID)
	}
	activeQ.Count(&resp.Stats.ActiveUsers)

	// Instance counts
	if isSysAdmin {
		h.db.Model(&model.Instance{}).Count(&resp.Stats.TotalInstances)
		h.db.Model(&model.Instance{}).Where("status = ?", model.InstanceStatusOnline).Count(&resp.Stats.OnlineInstances)
	} else if deptID != nil {
		var accessedIDs []string
		h.db.Model(&model.InstanceAccess{}).
			Where("department_id = ?", *deptID).
			Pluck("instance_id", &accessedIDs)
		resp.Stats.TotalInstances = int64(len(accessedIDs))
		if len(accessedIDs) > 0 {
			h.db.Model(&model.Instance{}).
				Where("id IN ? AND status = ?", accessedIDs, model.InstanceStatusOnline).
				Count(&resp.Stats.OnlineInstances)
		}
	}

	// Session count (scope by accessible instances for non-admin)
	sessionQ := h.db.Model(&model.ChatSession{})
	if !isSysAdmin && deptID != nil {
		var accessedIDs []string
		h.db.Model(&model.InstanceAccess{}).Where("department_id = ?", *deptID).Pluck("instance_id", &accessedIDs)
		if len(accessedIDs) > 0 {
			sessionQ = sessionQ.Where("instance_id IN ?", accessedIDs)
		} else {
			sessionQ = sessionQ.Where("1 = 0")
		}
	}
	sessionQ.Count(&resp.Stats.TotalSessions)

	// Resource count (global for now)
	h.db.Model(&model.Resource{}).Count(&resp.Stats.TotalResources)

	// Skill count (global for now)
	h.db.Model(&model.Skill{}).Count(&resp.Stats.TotalSkills)

	// ── Instance health cards ─────────────────────────
	var instances []model.Instance
	instQ := h.db.Model(&model.Instance{})
	if !isSysAdmin && deptID != nil {
		var accessedIDs []string
		h.db.Model(&model.InstanceAccess{}).Where("department_id = ?", *deptID).Pluck("instance_id", &accessedIDs)
		if len(accessedIDs) > 0 {
			instQ = instQ.Where("id IN ?", accessedIDs)
		} else {
			instQ = instQ.Where("1 = 0")
		}
	}
	instQ.Find(&instances)

	for _, inst := range instances {
		var agentCount, sessionCount int64
		h.db.Model(&model.AgentMeta{}).Where("instance_id = ?", inst.ID).Count(&agentCount)
		h.db.Model(&model.ChatSession{}).Where("instance_id = ?", inst.ID).Count(&sessionCount)
		resp.InstanceHealth = append(resp.InstanceHealth, DashboardInstanceHealth{
			ID:              inst.ID,
			Name:            inst.Name,
			Status:          string(inst.Status),
			Version:         inst.Version,
			AgentCount:      agentCount,
			SessionCount:    sessionCount,
			LastHealthCheck: inst.LastHealthCheck,
		})
	}

	// ── Provider distribution ─────────────────────────
	// Aggregate agents by instance as a proxy for provider distribution
	type provRow struct {
		InstanceID string `gorm:"column:instance_id"`
		Count      int64  `gorm:"column:count"`
	}
	var provRows []provRow
	provQ := h.db.Table("agent_metas").
		Select("instance_id, count(*) as count").
		Group("instance_id").
		Order("count DESC").
		Limit(10)
	if !isSysAdmin && deptID != nil {
		var accessedIDs []string
		h.db.Model(&model.InstanceAccess{}).Where("department_id = ?", *deptID).Pluck("instance_id", &accessedIDs)
		if len(accessedIDs) > 0 {
			provQ = provQ.Where("instance_id IN ?", accessedIDs)
		} else {
			provQ = provQ.Where("1 = 0")
		}
	}
	provQ.Scan(&provRows)

	// Build an instance name map
	instNameMap := make(map[string]string, len(instances))
	for _, inst := range instances {
		instNameMap[inst.ID] = inst.Name
	}
	for _, r := range provRows {
		name := instNameMap[r.InstanceID]
		if name == "" {
			name = r.InstanceID
		}
		resp.ProviderDistribution = append(resp.ProviderDistribution, DashboardProviderDist{
			Provider:     r.InstanceID,
			ProviderName: name,
			Count:        r.Count,
		})
	}

	// ── Recent activity ───────────────────────────────
	weekAgo := time.Now().AddDate(0, 0, -7)

	type recentRow struct {
		ID         string    `gorm:"column:id"`
		UserID     string    `gorm:"column:user_id"`
		UserName   string    `gorm:"column:user_name"`
		Action     string    `gorm:"column:action"`
		Resource   string    `gorm:"column:resource"`
		ResourceID *string   `gorm:"column:resource_id"`
		Result     string    `gorm:"column:result"`
		CreatedAt  time.Time `gorm:"column:created_at"`
	}
	var recentRows []recentRow
	recentQ := h.db.Table("audit_logs al").
		Select("al.id, al.user_id, COALESCE(u.name, '') as user_name, al.action, al.resource, al.resource_id, al.result, al.created_at").
		Joins("LEFT JOIN users u ON u.id = al.user_id").
		Where("al.created_at >= ?", weekAgo)
	if !isSysAdmin && deptID != nil {
		var deptUserIDs []string
		h.db.Model(&model.User{}).Where("department_id = ?", *deptID).Pluck("id", &deptUserIDs)
		if len(deptUserIDs) > 0 {
			recentQ = recentQ.Where("al.user_id IN ?", deptUserIDs)
		} else {
			recentQ = recentQ.Where("1 = 0")
		}
	}
	recentQ.Order("al.created_at DESC").Limit(10).Scan(&recentRows)

	for _, r := range recentRows {
		resp.RecentActivity = append(resp.RecentActivity, DashboardRecentActivity{
			ID:         r.ID,
			UserID:     r.UserID,
			UserName:   r.UserName,
			Action:     r.Action,
			Resource:   r.Resource,
			ResourceID: r.ResourceID,
			Result:     r.Result,
			CreatedAt:  r.CreatedAt,
		})
	}

	response.OK(c, resp)
}
