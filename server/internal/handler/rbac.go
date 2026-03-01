package handler

import (
	"github.com/casbin/casbin/v2"
	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
)

// RBACHandler handles RBAC policy management endpoints.
// All endpoints are SYSTEM_ADMIN-only (enforced at the route level).
type RBACHandler struct {
	enforcer *casbin.Enforcer
}

// NewRBACHandler creates a new RBACHandler.
func NewRBACHandler(enforcer *casbin.Enforcer) *RBACHandler {
	return &RBACHandler{enforcer: enforcer}
}

// ─── Request Types ─────────────────────────────────────

type PolicyRule struct {
	Role     string `json:"role" binding:"required"`
	Resource string `json:"resource" binding:"required"`
	Action   string `json:"action" binding:"required"`
}

// ─── Response Types ────────────────────────────────────

type RoleInfo struct {
	Role            string       `json:"role"`
	PermissionCount int          `json:"permissionCount"`
	Permissions     []Permission `json:"permissions"`
}

type Permission struct {
	Resource string `json:"resource"`
	Action   string `json:"action"`
}

// ─── Handlers ──────────────────────────────────────────

// ListPolicies handles GET /api/v1/rbac/policies
// Returns all policies grouped by role. Optionally filtered by ?role=ROLE_NAME.
func (h *RBACHandler) ListPolicies(c *gin.Context) {
	roleFilter := c.Query("role")

	var rawPolicies [][]string
	var err error
	if roleFilter != "" {
		rawPolicies, err = h.enforcer.GetFilteredPolicy(0, roleFilter)
	} else {
		rawPolicies, err = h.enforcer.GetPolicy()
	}
	if err != nil {
		response.InternalError(c, "failed to fetch policies")
		return
	}

	// Group by role
	grouped := map[string][]Permission{}
	for _, p := range rawPolicies {
		// p = [role, domain, resource, action]
		if len(p) < 4 {
			continue
		}
		role := p[0]
		grouped[role] = append(grouped[role], Permission{
			Resource: p[2],
			Action:   p[3],
		})
	}

	roles := make([]RoleInfo, 0, len(grouped))
	for role, perms := range grouped {
		roles = append(roles, RoleInfo{
			Role:            role,
			PermissionCount: len(perms),
			Permissions:     perms,
		})
	}

	response.OK(c, gin.H{"roles": roles, "total": len(rawPolicies)})
}

// ListRoles handles GET /api/v1/rbac/roles
// Returns a summary of each known role with permission count.
func (h *RBACHandler) ListRoles(c *gin.Context) {
	all, err := h.enforcer.GetPolicy()
	if err != nil {
		response.InternalError(c, "failed to fetch policies")
		return
	}

	counts := map[string]int{}
	for _, p := range all {
		if len(p) > 0 {
			counts[p[0]]++
		}
	}

	roles := make([]gin.H, 0, len(counts))
	for role, count := range counts {
		roles = append(roles, gin.H{
			"role":            role,
			"permissionCount": count,
		})
	}

	response.OK(c, gin.H{"roles": roles})
}

// AddPolicy handles POST /api/v1/rbac/policies
// Adds a permission rule to a role and persists to the policy file.
func (h *RBACHandler) AddPolicy(c *gin.Context) {
	var req PolicyRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Check if already exists
	existing, _ := h.enforcer.GetFilteredPolicy(0, req.Role)
	for _, p := range existing {
		if len(p) >= 4 && p[2] == req.Resource && p[3] == req.Action {
			response.Conflict(c, "policy rule already exists")
			return
		}
	}

	// Add: (role, domain="*", resource, action)
	ok, err := h.enforcer.AddPolicy(req.Role, "*", req.Resource, req.Action)
	if err != nil {
		response.InternalError(c, "failed to add policy: "+err.Error())
		return
	}
	if !ok {
		response.Conflict(c, "policy rule already exists")
		return
	}

	// Persist to file (best-effort; fails silently if configs is mounted read-only)
	_ = h.enforcer.SavePolicy()

	response.Created(c, gin.H{
		"role":     req.Role,
		"resource": req.Resource,
		"action":   req.Action,
	})
}

// RemovePolicy handles DELETE /api/v1/rbac/policies
// Removes a permission rule from a role and persists to the policy file.
func (h *RBACHandler) RemovePolicy(c *gin.Context) {
	var req PolicyRule
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	ok, err := h.enforcer.RemovePolicy(req.Role, "*", req.Resource, req.Action)
	if err != nil {
		response.InternalError(c, "failed to remove policy: "+err.Error())
		return
	}
	if !ok {
		response.NotFound(c, "policy rule not found")
		return
	}

	_ = h.enforcer.SavePolicy()

	response.OK(c, nil)
}
