package middleware

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/szsip239/teamclaw/server/internal/config"
	"github.com/szsip239/teamclaw/server/internal/pkg/response"
)

// ContextKey constants for values stored in gin.Context.
const (
	ContextUserID   = "userID"
	ContextUserRole = "userRole"
)

// JWTAuth returns a Gin middleware that verifies JWT access tokens.
func JWTAuth(cfg *config.JWTConfig) gin.HandlerFunc {
	publicKey, err := ParseRSAPublicKey(cfg.PublicKey)
	if err != nil {
		panic(fmt.Sprintf("failed to parse JWT public key: %v", err))
	}

	return func(c *gin.Context) {
		tokenStr := extractToken(c)
		if tokenStr == "" {
			response.Unauthorized(c, "missing access token")
			c.Abort()
			return
		}

		claims := &AccessClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return publicKey, nil
		}, jwt.WithIssuer(cfg.Issuer))

		if err != nil || !token.Valid {
			response.Unauthorized(c, "invalid or expired token")
			c.Abort()
			return
		}

		if claims.UserID == "" || claims.Role == "" {
			response.Unauthorized(c, "invalid token payload")
			c.Abort()
			return
		}

		c.Set(ContextUserID, claims.UserID)
		c.Set(ContextUserRole, claims.Role)
		c.Next()
	}
}

// AccessClaims represents the JWT access token payload.
type AccessClaims struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// RefreshClaims represents the JWT refresh token payload.
type RefreshClaims struct {
	UserID string `json:"userId"`
	jwt.RegisteredClaims
}

// JWTService handles token signing and verification.
type JWTService struct {
	privateKey    *rsa.PrivateKey
	publicKey     *rsa.PublicKey
	accessExpiry  time.Duration
	refreshExpiry time.Duration
	issuer        string
}

// NewJWTService creates a new JWTService from config.
func NewJWTService(cfg *config.JWTConfig) (*JWTService, error) {
	privKey, err := ParseRSAPrivateKey(cfg.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to parse private key: %w", err)
	}
	pubKey, err := ParseRSAPublicKey(cfg.PublicKey)
	if err != nil {
		return nil, fmt.Errorf("failed to parse public key: %w", err)
	}
	return &JWTService{
		privateKey:    privKey,
		publicKey:     pubKey,
		accessExpiry:  cfg.AccessExpiry,
		refreshExpiry: cfg.RefreshExpiry,
		issuer:        cfg.Issuer,
	}, nil
}

// SignAccessToken creates a new signed access token.
func (s *JWTService) SignAccessToken(userID, role string) (string, error) {
	now := time.Now()
	claims := AccessClaims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessExpiry)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(s.privateKey)
}

// SignRefreshToken creates a new signed refresh token.
func (s *JWTService) SignRefreshToken(userID string) (string, error) {
	now := time.Now()
	claims := RefreshClaims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.refreshExpiry)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(s.privateKey)
}

// VerifyAccessToken parses and validates an access token string.
func (s *JWTService) VerifyAccessToken(tokenStr string) (*AccessClaims, error) {
	claims := &AccessClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return s.publicKey, nil
	}, jwt.WithIssuer(s.issuer))
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// VerifyRefreshToken parses and validates a refresh token string.
func (s *JWTService) VerifyRefreshToken(tokenStr string) (*RefreshClaims, error) {
	claims := &RefreshClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
		return s.publicKey, nil
	}, jwt.WithIssuer(s.issuer))
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

// ─── Helpers ───────────────────────────────────────────

func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	if cookie, err := c.Cookie("access_token"); err == nil {
		return cookie
	}
	return ""
}

// ParseRSAPublicKey decodes a Base64-encoded PEM public key.
func ParseRSAPublicKey(b64 string) (*rsa.PublicKey, error) {
	pemBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}
	pub, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("not an RSA public key")
	}
	return rsaPub, nil
}

// ParseRSAPrivateKey decodes a Base64-encoded PEM PKCS8 private key.
func ParseRSAPrivateKey(b64 string) (*rsa.PrivateKey, error) {
	pemBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("base64 decode: %w", err)
	}
	block, _ := pem.Decode(pemBytes)
	if block == nil {
		return nil, errors.New("failed to decode PEM block")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, err
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("not an RSA private key")
	}
	return rsaKey, nil
}

// GetUserID returns the authenticated user's ID from gin context.
func GetUserID(c *gin.Context) string {
	v, _ := c.Get(ContextUserID)
	s, _ := v.(string)
	return s
}

// GetUserRole returns the authenticated user's role from gin context.
func GetUserRole(c *gin.Context) string {
	v, _ := c.Get(ContextUserRole)
	s, _ := v.(string)
	return s
}
