package handler

import (
	"encoding/csv"
	"fmt"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"gorm.io/gorm"
)

// AuditLogHandler handles audit log query and export endpoints.
type AuditLogHandler struct{ db *gorm.DB }

// NewAuditLogHandler creates a new AuditLogHandler.
func NewAuditLogHandler(db *gorm.DB) *AuditLogHandler { return &AuditLogHandler{db: db} }

// AuditLogResponse is the API representation of an AuditLog record.
type AuditLogResponse struct {
	ID         string    `json:"id"`
	UserID     string    `json:"userId"`
	UserName   string    `json:"userName"`
	UserEmail  string    `json:"userEmail"`
	Action     string    `json:"action"`
	Resource   string    `json:"resource"`
	ResourceID *string   `json:"resourceId"`
	Details    *string   `json:"details"`
	IPAddress  string    `json:"ipAddress"`
	UserAgent  *string   `json:"userAgent"`
	Result     string    `json:"result"`
	CreatedAt  time.Time `json:"createdAt"`
}

func toAuditLogResponse(l model.AuditLog) AuditLogResponse {
	r := AuditLogResponse{
		ID:         l.ID,
		UserID:     l.UserID,
		Action:     l.Action,
		Resource:   l.Resource,
		ResourceID: l.ResourceID,
		Details:    l.Details,
		IPAddress:  l.IPAddress,
		UserAgent:  l.UserAgent,
		Result:     l.Result,
		CreatedAt:  l.CreatedAt,
	}
	if l.User.ID != "" {
		r.UserName = l.User.Name
		r.UserEmail = l.User.Email
	}
	return r
}

// buildQuery builds a filtered audit log query.
// DEPT_ADMIN sees only logs for users in their own department.
func (h *AuditLogHandler) buildQuery(c *gin.Context) *gorm.DB {
	q := h.db.Model(&model.AuditLog{}).Preload("User")

	// DEPT_ADMIN scope: restrict to own department's users
	if model.Role(middleware.GetUserRole(c)) == model.RoleDeptAdmin {
		var caller model.User
		h.db.First(&caller, "id = ?", middleware.GetUserID(c))
		if caller.DepartmentID == nil {
			// No department → return nothing
			q = q.Where("1 = 0")
			return q
		}
		var deptUserIDs []string
		h.db.Model(&model.User{}).
			Where("department_id = ?", *caller.DepartmentID).
			Pluck("id", &deptUserIDs)
		if len(deptUserIDs) == 0 {
			q = q.Where("1 = 0")
			return q
		}
		q = q.Where("user_id IN ?", deptUserIDs)
	}

	// Optional filters
	if v := c.Query("userId"); v != "" {
		q = q.Where("user_id = ?", v)
	}
	if v := c.Query("resource"); v != "" {
		q = q.Where("resource = ?", v)
	}
	if v := c.Query("action"); v != "" {
		q = q.Where("action ILIKE ?", "%"+v+"%")
	}
	if v := c.Query("result"); v != "" {
		q = q.Where("result = ?", v)
	}
	if v := c.Query("startDate"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			q = q.Where("created_at >= ?", t)
		}
	}
	if v := c.Query("endDate"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			q = q.Where("created_at <= ?", t)
		}
	}

	return q
}

// List handles GET /api/v1/audit-logs
// Query params: page, pageSize, userId, resource, action, result, startDate, endDate
func (h *AuditLogHandler) List(c *gin.Context) {
	page, pageSize := ParsePagination(c)
	q := h.buildQuery(c)

	var total int64
	q.Count(&total)

	var logs []model.AuditLog
	q.Order("created_at DESC").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&logs)

	items := make([]AuditLogResponse, len(logs))
	for i, l := range logs {
		items[i] = toAuditLogResponse(l)
	}
	response.List(c, items, total, page, pageSize)
}

// Export handles GET /api/v1/audit-logs/export
// Streams a CSV file with the same filter params as List (no pagination).
func (h *AuditLogHandler) Export(c *gin.Context) {
	q := h.buildQuery(c)

	var logs []model.AuditLog
	if err := q.Order("created_at DESC").Limit(10000).Find(&logs).Error; err != nil {
		response.InternalError(c, "failed to fetch audit logs")
		return
	}

	filename := fmt.Sprintf("audit_logs_%s.csv", time.Now().Format("20060102_150405"))
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", "attachment; filename="+filename)
	c.Header("Transfer-Encoding", "chunked")

	w := csv.NewWriter(c.Writer)
	// BOM for Excel UTF-8 compatibility
	_, _ = c.Writer.Write([]byte("\xEF\xBB\xBF"))

	_ = w.Write([]string{
		"ID", "User ID", "User Name", "User Email",
		"Action", "Resource", "Resource ID",
		"IP Address", "Result", "Created At",
	})

	for _, l := range logs {
		name, email := "", ""
		if l.User.ID != "" {
			name = l.User.Name
			email = l.User.Email
		}
		resourceID := ""
		if l.ResourceID != nil {
			resourceID = *l.ResourceID
		}
		_ = w.Write([]string{
			l.ID, l.UserID, name, email,
			l.Action, l.Resource, resourceID,
			l.IPAddress, l.Result,
			l.CreatedAt.Format(time.RFC3339),
		})
	}

	w.Flush()
}
