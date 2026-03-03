# 工作流：新增 API 端点

参考 SKILL：`.agents/skills/go-api-development/SKILL.md`，`.agents/skills/rbac-casbin/SKILL.md`

---

## 步骤清单

### 1. 在 `model/models.go` 添加响应类型

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

- `type FooHandler struct{ db *gorm.DB }`
- `func NewFooHandler(db *gorm.DB) *FooHandler`
- Request 类型（带 binding tag）
- List / Get / Create / Update / Delete 五个方法
- 使用 `ParsePagination(c)`、`newBaseModel()`、`response.XXX(c, ...)`

### 3. 在 `cmd/server/main.go` 注册路由

```go
fooHandler := handler.NewFooHandler(db)
foos := protected.Group("/foos")
{
    foos.GET("",       middleware.RequirePermission(enforcer, "foos", "list"),   fooHandler.List)
    foos.GET("/:id",   middleware.RequirePermission(enforcer, "foos", "view"),   fooHandler.Get)
    foos.POST("",      middleware.RequirePermission(enforcer, "foos", "create"), fooHandler.Create)
    foos.PATCH("/:id", middleware.RequirePermission(enforcer, "foos", "update"), fooHandler.Update)
    foos.DELETE("/:id",middleware.RequirePermission(enforcer, "foos", "delete"), fooHandler.Delete)
}
```

> **关键**：`group.GET("")` 注册的路径是 `/api/v1/foos`（无尾斜杠）。前端请求必须与此匹配。

### 4. 在 `configs/rbac_policy.csv` 添加策略

```csv
p, SYSTEM_ADMIN, *, foos, list
p, SYSTEM_ADMIN, *, foos, view
p, SYSTEM_ADMIN, *, foos, create
p, SYSTEM_ADMIN, *, foos, update
p, SYSTEM_ADMIN, *, foos, delete
p, DEPT_ADMIN,   *, foos, list
p, DEPT_ADMIN,   *, foos, view
p, USER,         *, foos, list
```

### 5. 重新构建并重启 API 容器

```bash
# ⚠️ docker restart 不会更新镜像，必须三步操作
cd /c/teamclaw
docker build --no-cache -t server-api ./server
docker stop tc-api && docker rm tc-api && docker run -d \
  --name tc-api --network teamclaw-dev -p 3200:3200 \
  $(docker inspect tc-api-prev --format "{{range .Config.Env}}-e {{.}} {{end}}" 2>/dev/null) \
  server-api
docker exec tc-api wget -qO- http://localhost:3200/healthz
```

### 6. 验证

```bash
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  # 有权限 → 200
  curl -s -w "\nHTTP:%{http_code}" http://tc-api:3200/api/v1/foos -H "Authorization: Bearer $TOKEN"
  # 无 token → 401
  curl -s -w "\nHTTP:%{http_code}" http://tc-api:3200/api/v1/foos
'
```

---

## 质量检查点

- [ ] `Updates()` 之后是否重新 `First()` 获取最新数据？
- [ ] List 接口是否有 `if len(ids) > 0` 守卫（如有 IN 查询）？
- [ ] Get 接口用的是 `"view"` 权限，不是 `"list"`？
- [ ] Update 时是否检查 Name 唯一性（排除自身）？
- [ ] AES 字段（GatewayToken、Credentials）是否在响应中被排除？
- [ ] DEPT_ADMIN 是否只能看到自己有权限的数据？
- [ ] `response.NamedList(c, "<resource>s", items, total, page, pageSize)` 字段名与前端一致？
