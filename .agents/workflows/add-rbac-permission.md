# 工作流：新增 RBAC 权限项

参考 SKILL：`.agents/skills/rbac-casbin/SKILL.md`

---

## 何时需要新增权限

- 新增了 API 端点
- 需要细化已有权限粒度（如把 `manage` 拆为 `create`/`update`/`delete`）
- 需要新增角色

---

## 步骤

### 1. 确定权限标识

格式：`<resource>:<action>`

| 已有资源 | 已有动作 |
|---------|---------|
| `users` | `list / create / update / delete` |
| `departments` | `list / view / create / update / delete` |
| `instances` | `view / manage` |
| `instance_access` | `manage` |
| `agents` | `view / create / manage / classify` |
| `chat` | `use` |
| `sessions` | `view_own / view_dept / view_all` |
| `skills` | `develop / manage_dept / manage_global` |
| `resources` | `manage` |
| `audit` | `view_dept / view_all` |
| `rbac` | `manage` |
| `monitor` | `view / view_basic` |

### 2. 编辑 `server/configs/rbac_policy.csv`

```csv
# 格式：p, <角色>, <域>, <资源>, <动作>
# 域始终用 * （当前不做域隔离）
p, SYSTEM_ADMIN, *, <resource>, <action>
p, DEPT_ADMIN,   *, <resource>, <action>
p, USER,         *, <resource>, <action>
```

### 3. 在路由中添加中间件

```go
foos.GET("/:id", middleware.RequirePermission(enforcer, "<resource>", "<action>"), handler.Get)
```

### 4. 重新构建并重启 API 容器

```bash
cd /c/teamclaw
docker build --no-cache -t server-api ./server
docker stop tc-api && docker rm tc-api
# 用完整环境变量重新 docker run（见 run-tests.md）
docker exec tc-api wget -qO- http://localhost:3200/healthz
```

### 5. 验证权限

```bash
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  # 有权限的角色 → 200
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  curl -s -w "\nHTTP:%{http_code}" http://tc-api:3200/api/v1/<resource> \
    -H "Authorization: Bearer $TOKEN"

  # 无权限的角色 → 403
  TOKEN2=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"alice@test.com\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  curl -s -w "\nHTTP:%{http_code}" http://tc-api:3200/api/v1/<resource> \
    -H "Authorization: Bearer $TOKEN2"
'
```

---

## 特殊情况：SYSTEM_ADMIN 绕过 Casbin

`SYSTEM_ADMIN` 角色直接跳过 Casbin 检查（在 `middleware/rbac.go:41` 中实现），无需在 `rbac_policy.csv` 中添加策略。策略文件中的 `SYSTEM_ADMIN` 行是为了文档化，实际上不生效。

---

## 已知限制

- Casbin 策略变更后必须重新构建容器（文件存储，无动态加载）
- 计划迁移到 GORM adapter 实现动态策略（技术债）
