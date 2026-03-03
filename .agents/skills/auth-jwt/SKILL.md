---
description: TeamClaw JWT RS256 认证 — token 签发、验证、刷新、密钥管理
---

# JWT 认证规范

## 当前实现状态

- **算法**：RS256（非对称签名）
- **私钥格式**：PKCS8，Base64 编码 PEM，通过 `JWT_PRIVATE_KEY` 注入
- **公钥格式**：PKIX，Base64 编码 PEM，通过 `JWT_PUBLIC_KEY` 注入
- **Access Token 有效期**：15 分钟（`cfg.JWT.AccessExpiry`）
- **Refresh Token 有效期**：7 天（`cfg.JWT.RefreshExpiry`）
- **Token 提取**：优先 `Authorization: Bearer <token>`，备用 `access_token` cookie

---

## 密钥生成

```bash
# 在 server/ 目录下生成 .env（含 RSA 密钥 + AES 密钥）
cd server
make gen-env          # 调用 cmd/keygen/main.go，输出到 .env
```

keygen 生成逻辑：
```go
// RSA-2048 密钥对
privateKey, _ := rsa.GenerateKey(rand.Reader, 2048)
// 私钥：PKCS8 + PEM + Base64
pkcs8Bytes, _ := x509.MarshalPKCS8PrivateKey(privateKey)
// 公钥：PKIX + PEM + Base64
pkixBytes, _ := x509.MarshalPKIXPublicKey(&privateKey.PublicKey)
```

---

## Token 结构

### AccessClaims（`middleware/auth.go`）

```go
type AccessClaims struct {
    UserID string `json:"userId"`
    Role   string `json:"role"`
    jwt.RegisteredClaims          // Issuer, IssuedAt, ExpiresAt
}
```

### RefreshClaims

```go
type RefreshClaims struct {
    UserID string `json:"userId"`
    jwt.RegisteredClaims
}
```

---

## 在 Handler 中使用 JWT

```go
import "github.com/szsip239/teamclaw/server/internal/middleware"

// 获取当前用户 ID
userID := middleware.GetUserID(c)

// 获取当前用户角色
role := middleware.GetUserRole(c)
```

### Context 键名常量

```go
middleware.ContextUserID   = "userID"
middleware.ContextUserRole = "userRole"
```

---

## JWTService API（`middleware/auth.go`）

```go
svc, err := middleware.NewJWTService(cfg.JWT)

// 签发 access token
accessToken, err  := svc.SignAccessToken(userID, role)

// 签发 refresh token
refreshToken, err := svc.SignRefreshToken(userID)

// 验证 access token（返回 claims 或 error）
claims, err := svc.VerifyAccessToken(tokenStr)

// 验证 refresh token
claims, err := svc.VerifyRefreshToken(tokenStr)
```

---

## RefreshToken 数据库记录

Refresh Token 以 bcrypt hash 存入 `refresh_tokens` 表：

```go
type RefreshToken struct {
    BaseModel
    UserID    string    `gorm:"not null;index"`
    TokenHash string    `gorm:"not null"`           // bcrypt hash
    ExpiresAt time.Time `gorm:"not null"`
    Revoked   bool      `gorm:"default:false"`
}
```

### 已知性能问题

验证时需遍历用户的所有 token 做 bcrypt 比对（`handler/auth.go`）。用户少时可接受，生产阶段需改为存储 HMAC（以 tokenID 索引）。

---

## 路由保护方式

```go
// 公开路由（无需 token）
public := r.Group("/api/v1")
public.POST("/auth/login",    authHandler.Login)
public.POST("/auth/register", authHandler.Register)
public.POST("/auth/refresh",  authHandler.RefreshToken)

// 受保护路由（需要有效 access token）
protected := r.Group("/api/v1")
protected.Use(middleware.JWTAuth(cfg.JWT))
protected.GET("/auth/me",     authHandler.GetMe)
```

---

## 调试命令

```bash
cd server

# 登录并获取 token（保存到 /tmp/tc_token）
bash scripts/debug.sh login [email] [password]

# 查看当前 token 对应的用户
bash scripts/debug.sh me

# 登出（清除服务端 refresh token + 本地 token 文件）
bash scripts/debug.sh logout

# 直接 decode token（不验证签名）
echo "<token>" | cut -d. -f2 | base64 -d 2>/dev/null | jq .
```

---

## 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `failed to parse JWT public key` | `JWT_PUBLIC_KEY` 不是 PKIX 格式或 Base64 有误 | 重新 `make gen-env` |
| `invalid or expired token` | access token 已过期 | 调用 `/auth/refresh` 获取新 token |
| `unexpected signing method` | 传入了 HS256 token（如 JWT.io 生成的） | 必须使用 RS256 私钥签发 |
| `invalid token payload` | claims 中 userID 或 role 为空 | 检查 `SignAccessToken` 参数 |
