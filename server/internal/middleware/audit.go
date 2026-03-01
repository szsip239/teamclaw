package middleware

import (
	"encoding/json"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/model"
	"gorm.io/gorm"
)

// AuditLog returns a middleware that records API operations to the audit log.
// Only applied to mutating routes (POST, PUT, PATCH, DELETE).
func AuditLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip non-mutating methods
		method := c.Request.Method
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			c.Next()
			return
		}

		c.Next()

		// Build audit entry after handler executes
		userID := GetUserID(c)
		if userID == "" {
			return
		}

		status := c.Writer.Status()
		result := "SUCCESS"
		if status >= 400 {
			result = "FAILURE"
		}

		details := map[string]interface{}{
			"method":     method,
			"path":       c.Request.URL.Path,
			"query":      c.Request.URL.RawQuery,
			"statusCode": status,
		}
		detailsJSON, _ := json.Marshal(details)
		detailsStr := string(detailsJSON)

		log := model.AuditLog{
			ID:        model.GenerateID(),
			UserID:    userID,
			Action:    method + " " + c.FullPath(),
			Resource:  extractResource(c.FullPath()),
			IPAddress: c.ClientIP(),
			UserAgent: strPtr(c.Request.UserAgent()),
			Details:   &detailsStr,
			Result:    result,
			CreatedAt: time.Now(),
		}

		// Fire-and-forget: don't block the response
		go func() {
			_ = db.Create(&log).Error
		}()
	}
}

func extractResource(fullPath string) string {
	// Extract resource name from path like "/api/v1/users/:id"
	// Returns "users", "instances", etc.
	parts := splitPath(fullPath)
	for i, p := range parts {
		if p == "v1" && i+1 < len(parts) {
			return parts[i+1]
		}
	}
	if len(parts) > 0 {
		return parts[len(parts)-1]
	}
	return "unknown"
}

func splitPath(path string) []string {
	var parts []string
	current := ""
	for _, c := range path {
		if c == '/' {
			if current != "" {
				parts = append(parts, current)
				current = ""
			}
		} else {
			current += string(c)
		}
	}
	if current != "" {
		parts = append(parts, current)
	}
	return parts
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
