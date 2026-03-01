package handler

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/model"
	"golang.org/x/crypto/bcrypt"
)

// newBaseModel creates a BaseModel with a generated ID and timestamps.
func newBaseModel() model.BaseModel {
	now := time.Now()
	return model.BaseModel{
		ID:        model.GenerateID(),
		CreatedAt: now,
		UpdatedAt: now,
	}
}

// HashPassword hashes a password using bcrypt with cost 12.
func HashPassword(password string) (string, error) {
	bytes, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	return string(bytes), err
}

// CheckPassword compares a password against a bcrypt hash.
func CheckPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

// RawJSON converts a json.RawMessage to a *string for JSONB storage.
// Returns nil when the message is empty or JSON null.
func RawJSON(msg json.RawMessage) *string {
	if len(msg) == 0 || string(msg) == "null" {
		return nil
	}
	s := string(msg)
	return &s
}

// ParsePagination extracts and clamps page/pageSize from query params.
func ParsePagination(c *gin.Context) (page, pageSize int) {
	page, _ = strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ = strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	return
}
