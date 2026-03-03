---
description: TeamClaw Go API 通用开发规范 — 端到端创建 RESTful API 端点
---

# Go API 开发规范

## 项目约定

- **后端路径**：`server/`，模块名 `github.com/szsip239/teamclaw/server`
- **Handler 直接持有 `*gorm.DB`**，无独立 Service/Repository 层（Demo 阶段）
- **统一响应格式**：`{ "code": 0, "message": "success", "data": {...} }`
- **CUID ID**：所有主键由 `model.GenerateID()` 生成
- **端口**：`tc-api` 容器，端口 3200

---

## 新增 API 端点标准流程

### 1. 在 `model/models.go` 中添加响应类型

```go
type FooResponse struct {
    ID        string    `json:"id"`
    Name      string    `json:"name"`
    CreatedAt time.Time `json:"createdAt"`
}

func (f *Foo) ToResponse() FooResponse {
    return FooResponse{ID: f.ID, Name: f.Name, CreatedAt: f.CreatedAt}
}
```

### 2. 创建 `handler/foo.go`

```go
package handler

import (
    "github.com/gin-gonic/gin"
    "github.com/szsip239/teamclaw/server/internal/model"
    "github.com/szsip239/teamclaw/server/internal/pkg/response"
    "gorm.io/gorm"
)

type FooHandler struct{ db *gorm.DB }

func NewFooHandler(db *gorm.DB) *FooHandler { return &FooHandler{db: db} }

// ── Request 类型 ───────────────────────────────────────

type CreateFooRequest struct {
    Name string `json:"name" binding:"required,min=1,max=100"`
}

// ── Handlers ───────────────────────────────────────────

func (h *FooHandler) List(c *gin.Context) {
    page, pageSize := ParsePagination(c)
    var total int64
    var foos []model.Foo
    h.db.Model(&model.Foo{}).Count(&total)
    h.db.Offset((page - 1) * pageSize).Limit(pageSize).Find(&foos)
    items := make([]FooResponse, len(foos))
    for i, f := range foos {
        items[i] = toFooResponse(f)
    }
    response.NamedList(c, "foos", items, total, page, pageSize)
}

func (h *FooHandler) Create(c *gin.Context) {
    var req CreateFooRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.BadRequest(c, "invalid request: "+err.Error())
        return
    }
    foo := model.Foo{BaseModel: newBaseModel(), Name: req.Name}
    if err := h.db.Create(&foo).Error; err != nil {
        response.InternalError(c, "failed to create foo")
        return
    }
    response.Created(c, toFooResponse(foo))
}
```

### 3. 在 `cmd/server/main.go` 注册路由

```go
fooHandler := handler.NewFooHandler(db)
foos := protected.Group("/foos")
{
    foos.GET("",     middleware.RequirePermission(enforcer, "foos", "list"),   fooHandler.List)
    foos.POST("",    middleware.RequirePermission(enforcer, "foos", "create"), fooHandler.Create)
    foos.PATCH("/:id", middleware.RequirePermission(enforcer, "foos", "update"), fooHandler.Update)
    foos.DELETE("/:id", middleware.RequirePermission(enforcer, "foos", "delete"), fooHandler.Delete)
}
```

> **关键**：`group.GET("")` → 路由 `/api/v1/foos`。前端钩子和 nginx 路由须与此一致。

### 4. 在 `configs/rbac_policy.csv` 添加权限

```csv
p, SYSTEM_ADMIN, *, foos, list
p, SYSTEM_ADMIN, *, foos, create
p, SYSTEM_ADMIN, *, foos, update
p, SYSTEM_ADMIN, *, foos, delete
p, DEPT_ADMIN,   *, foos, list
```

### 5. 重建容器（不是 restart！）

```bash
cd /c/teamclaw
docker build --no-cache -t server-api ./server
docker stop tc-api && docker rm tc-api && docker run -d \
  --name tc-api --network teamclaw-dev -p 3200:3200 \
  <env vars> server-api
docker exec tc-api wget -qO- http://localhost:3200/healthz
```

---

## 共享 Helpers（`handler/helpers.go`）

| 函数 | 用途 |
|------|------|
| `newBaseModel()` | 生成带 CUID ID + 时间戳的 BaseModel |
| `ParsePagination(c)` | 解析 page/pageSize，自动 clamp（min 1，pageSize max 100） |
| `RawJSON(msg)` | `json.RawMessage → *string` 用于 JSONB 存储 |
| `HashPassword(pw)` | bcrypt cost=12 |
| `CheckPassword(pw, hash)` | bcrypt 验证 |
| `isDeptAdmin(c)` | 当前用户是否为 DEPT_ADMIN |

---

## 响应函数速查（`pkg/response/`）

```go
response.OK(c, data)                                    // 200
response.Created(c, data)                               // 201
response.NamedList(c, "items", items, total, p, ps)     // 200 分页（字段名自定）
response.BadRequest(c, msg)                             // 400
response.Unauthorized(c, msg)                           // 401
response.Forbidden(c, msg)                              // 403
response.NotFound(c, msg)                               // 404
response.Conflict(c, msg)                               // 409
response.InternalError(c, msg)                          // 500
```

**`response.NamedList` 字段名约定**：`users`、`instances`、`agents`、`departments`、`skills`、`resources`、`logs`、`sessions`（与前端 TypeScript 类型一致）。

---

## 常见陷阱

1. **`Updates()` 不刷新结构体** → 更新后必须重新 `First(&entity, "id=?", id)`
2. **`IN ()` 空切片** → 查询前先 `if len(ids) > 0` 守卫
3. **AES 加密字段**（GatewayToken、Credentials）→ 写入前 `enc.Encrypt()`，永不在响应中返回
4. **DEPT_ADMIN access check** → 在 Preload 之前做，避免无权访问时浪费查询
5. **Name 唯一性检查** → Update 时要排除自身：`WHERE name=? AND id!=?`
6. **`group.GET("")` vs `/` 尾斜杠** → 务必用 `""` 不要用 `"/"`，Gin 会注册为不同路由
7. **docker build 缓存** → 代码改动后必须 `--no-cache`，否则旧二进制仍在镜像中

---

## 前后端响应格式对齐

### Go 响应信封
```json
{"code": 0, "message": "success", "data": {...}}
```

### 前端自动解包
`src/lib/api-client.ts` 的 `unwrapGoResponse()` 会自动剥离 `data` 字段，
前端钩子直接收到 `data` 内容。

### 分页响应结构
```json
{
  "code": 0, "message": "success",
  "data": {
    "users": [...],   // 字段名与 NamedList 第二参数一致
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```
