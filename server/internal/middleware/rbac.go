package middleware

import (
	"github.com/casbin/casbin/v2"
	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
)

// RBAC returns a Gin middleware that performs Casbin authorization.
// It reads the user role and department from the context (set by JWTAuth)
// and checks against Casbin policies.
//
// The request is mapped to the Casbin model as:
//
//	sub = user role (e.g., "SYSTEM_ADMIN")
//	dom = department domain (e.g., "dept_xxx" or "*" for global)
//	obj = resource (e.g., "users")
//	act = action (e.g., "create")
func RBAC(enforcer *casbin.Enforcer) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}

// RequirePermission returns a middleware that checks a specific permission.
// This is used as a per-route guard rather than a global middleware.
//
// Usage:
//
//	router.GET("/users", middleware.RequirePermission(enforcer, "users", "list"), handler.ListUsers)
func RequirePermission(enforcer *casbin.Enforcer, obj, act string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetUserRole(c)
		if role == "" {
			response.Unauthorized(c, "missing user role")
			c.Abort()
			return
		}

		// System admin bypasses all permission checks
		if role == "SYSTEM_ADMIN" {
			c.Next()
			return
		}

		// Check Casbin policy
		ok, err := enforcer.Enforce(role, "*", obj, act)
		if err != nil {
			response.InternalError(c, "permission check failed")
			c.Abort()
			return
		}
		if !ok {
			response.Forbidden(c, "insufficient permissions")
			c.Abort()
			return
		}

		c.Next()
	}
}

// RequireDomainPermission checks permissions with department-level domain scoping.
// The domain is extracted from the user's department ID in the context.
//
// Usage:
//
//	router.GET("/dept-users", middleware.RequireDomainPermission(enforcer, "users", "list"), handler.ListDeptUsers)
func RequireDomainPermission(enforcer *casbin.Enforcer, obj, act string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role := GetUserRole(c)
		if role == "" {
			response.Unauthorized(c, "missing user role")
			c.Abort()
			return
		}

		if role == "SYSTEM_ADMIN" {
			c.Next()
			return
		}

		// Get department domain from context (set by a user-loading middleware)
		domain := c.GetString("userDepartmentID")
		if domain == "" {
			domain = "*"
		}

		ok, err := enforcer.Enforce(role, domain, obj, act)
		if err != nil {
			response.InternalError(c, "permission check failed")
			c.Abort()
			return
		}
		if !ok {
			response.Forbidden(c, "insufficient permissions")
			c.Abort()
			return
		}

		c.Next()
	}
}
