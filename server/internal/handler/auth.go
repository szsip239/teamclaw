package handler

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/szsip239/teamclaw/server/internal/middleware"
	"github.com/szsip239/teamclaw/server/internal/model"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// hashRefreshToken returns a SHA-256 hex digest of the given JWT string.
// bcrypt truncates input at 72 bytes and would corrupt long JWTs.
func hashRefreshToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// AuthHandler handles authentication endpoints.
type AuthHandler struct {
	db  *gorm.DB
	jwt *middleware.JWTService
}

// NewAuthHandler creates a new AuthHandler.
func NewAuthHandler(db *gorm.DB, jwt *middleware.JWTService) *AuthHandler {
	return &AuthHandler{db: db, jwt: jwt}
}

// ─── Request / Response Types ──────────────────────────

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Name     string `json:"name" binding:"required,min=1,max=100"`
	Password string `json:"password" binding:"required,min=8"`
}

type TokenResponse struct {
	AccessToken  string             `json:"accessToken"`
	RefreshToken string             `json:"refreshToken"`
	User         model.UserResponse `json:"user"`
}

type RefreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

// ─── Handlers ──────────────────────────────────────────

// Login handles POST /api/v1/auth/login
// @Summary User login
// @Tags auth
// @Accept json
// @Produce json
// @Param body body LoginRequest true "Login credentials"
// @Success 200 {object} response.Response{data=TokenResponse}
// @Router /api/v1/auth/login [post]
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	var user model.User
	if err := h.db.Preload("Department").Where("email = ?", req.Email).First(&user).Error; err != nil {
		response.Unauthorized(c, "invalid email or password")
		return
	}

	if user.Status != model.UserStatusActive {
		response.Unauthorized(c, "account is disabled")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		response.Unauthorized(c, "invalid email or password")
		return
	}

	accessToken, err := h.jwt.SignAccessToken(user.ID, string(user.Role))
	if err != nil {
		response.InternalError(c, "failed to generate access token")
		return
	}

	refreshToken, err := h.jwt.SignRefreshToken(user.ID)
	if err != nil {
		response.InternalError(c, "failed to generate refresh token")
		return
	}

	// Store refresh token hash (SHA-256; bcrypt truncates at 72 bytes)
	rt := model.RefreshToken{
		BaseModel: model.BaseModel{ID: model.GenerateID(), CreatedAt: time.Now(), UpdatedAt: time.Now()},
		UserID:    user.ID,
		TokenHash: hashRefreshToken(refreshToken),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	h.db.Create(&rt)

	// Update last login
	now := time.Now()
	h.db.Model(&user).Update("last_login_at", now)

	// Set cookie for backward compatibility
	c.SetCookie("access_token", accessToken, 900, "/", "", false, true)

	response.OK(c, TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user.ToResponse(),
	})
}

// Register handles POST /api/v1/auth/register
// @Summary User registration
// @Tags auth
// @Accept json
// @Produce json
// @Param body body RegisterRequest true "Registration info"
// @Success 201 {object} response.Response{data=TokenResponse}
// @Router /api/v1/auth/register [post]
func (h *AuthHandler) Register(c *gin.Context) {
	var req RegisterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request: "+err.Error())
		return
	}

	// Check if email already exists
	var count int64
	h.db.Model(&model.User{}).Where("email = ?", req.Email).Count(&count)
	if count > 0 {
		response.Conflict(c, "email already registered")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		response.InternalError(c, "failed to hash password")
		return
	}

	user := model.User{
		BaseModel:    model.BaseModel{ID: model.GenerateID(), CreatedAt: time.Now(), UpdatedAt: time.Now()},
		Email:        req.Email,
		Name:         req.Name,
		PasswordHash: string(hash),
		Role:         model.RoleUser,
		Status:       model.UserStatusActive,
	}

	if err := h.db.Create(&user).Error; err != nil {
		response.InternalError(c, "failed to create user")
		return
	}

	accessToken, _ := h.jwt.SignAccessToken(user.ID, string(user.Role))
	refreshToken, _ := h.jwt.SignRefreshToken(user.ID)

	// Store refresh token hash (SHA-256)
	rt := model.RefreshToken{
		BaseModel: model.BaseModel{ID: model.GenerateID(), CreatedAt: time.Now(), UpdatedAt: time.Now()},
		UserID:    user.ID,
		TokenHash: hashRefreshToken(refreshToken),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	h.db.Create(&rt)

	c.SetCookie("access_token", accessToken, 900, "/", "", false, true)

	response.Created(c, TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		User:         user.ToResponse(),
	})
}

// Refresh handles POST /api/v1/auth/refresh
// @Summary Refresh access token
// @Tags auth
// @Accept json
// @Produce json
// @Param body body RefreshRequest true "Refresh token"
// @Success 200 {object} response.Response{data=TokenResponse}
// @Router /api/v1/auth/refresh [post]
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req RefreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.BadRequest(c, "invalid request")
		return
	}

	claims, err := h.jwt.VerifyRefreshToken(req.RefreshToken)
	if err != nil {
		response.Unauthorized(c, "invalid refresh token")
		return
	}

	// Verify token exists in DB (SHA-256 lookup)
	tokenHash := hashRefreshToken(req.RefreshToken)
	var rt model.RefreshToken
	err = h.db.Where("user_id = ? AND token_hash = ? AND expires_at > ?",
		claims.UserID, tokenHash, time.Now()).First(&rt).Error
	if err != nil {
		response.Unauthorized(c, "refresh token not found or expired")
		return
	}
	// Delete used token (rotation)
	h.db.Delete(&rt)

	var user model.User
	if err := h.db.Preload("Department").First(&user, "id = ?", claims.UserID).Error; err != nil {
		response.Unauthorized(c, "user not found")
		return
	}

	accessToken, _ := h.jwt.SignAccessToken(user.ID, string(user.Role))
	newRefreshToken, _ := h.jwt.SignRefreshToken(user.ID)

	// Store new refresh token hash (SHA-256)
	newRt := model.RefreshToken{
		BaseModel: model.BaseModel{ID: model.GenerateID(), CreatedAt: time.Now(), UpdatedAt: time.Now()},
		UserID:    user.ID,
		TokenHash: hashRefreshToken(newRefreshToken),
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour),
	}
	h.db.Create(&newRt)

	c.SetCookie("access_token", accessToken, 900, "/", "", false, true)

	response.OK(c, TokenResponse{
		AccessToken:  accessToken,
		RefreshToken: newRefreshToken,
		User:         user.ToResponse(),
	})
}

// Logout handles POST /api/v1/auth/logout
// @Summary User logout
// @Tags auth
// @Security BearerAuth
// @Success 200 {object} response.Response
// @Router /api/v1/auth/logout [post]
func (h *AuthHandler) Logout(c *gin.Context) {
	userID := middleware.GetUserID(c)

	// Delete all refresh tokens for this user
	h.db.Where("user_id = ?", userID).Delete(&model.RefreshToken{})

	// Clear cookie
	c.SetCookie("access_token", "", -1, "/", "", false, true)

	response.OK(c, nil)
}

// GetMe handles GET /api/v1/auth/me
// @Summary Get current user info
// @Tags auth
// @Security BearerAuth
// @Success 200 {object} response.Response{data=model.UserResponse}
// @Router /api/v1/auth/me [get]
func (h *AuthHandler) GetMe(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var user model.User
	if err := h.db.Preload("Department").First(&user, "id = ?", userID).Error; err != nil {
		response.NotFound(c, "user not found")
		return
	}

	response.OK(c, user.ToResponse())
}

// RegisterRoutes registers all auth routes on the given router group.
func (h *AuthHandler) RegisterRoutes(public, protected *gin.RouterGroup) {
	auth := public.Group("/auth")
	{
		auth.POST("/login", h.Login)
		auth.POST("/register", h.Register)
		auth.POST("/refresh", h.Refresh)
	}

	authProtected := protected.Group("/auth")
	{
		authProtected.POST("/logout", h.Logout)
		authProtected.GET("/me", h.GetMe)
	}
}

// ─── Unexported helpers ────────────────────────────────

// Ensure http package import is used (for swagger annotations).
var _ = http.StatusOK
