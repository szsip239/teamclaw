---
description: TeamClaw Casbin RBAC — 角色、权限、策略的配置与调试
---

# Casbin RBAC 规范

## 当前实现状态

- **策略存储**：文件（`server/configs/rbac_policy.csv`）
- **模型文件**：`server/configs/rbac_model.conf`
- **绕过规则**：`SYSTEM_ADMIN` 角色直接跳过 Casbin，不查策略文件

---

## 策略文件格式

```csv
# p = policy: sub(角色), dom(域/*), obj(资源), act(动作)
p, SYSTEM_ADMIN, *, users, list
p, SYSTEM_ADMIN, *, users, create
p, DEPT_ADMIN,   *, departments, list
p, DEPT_ADMIN,   *, departments, view
p, USER,         *, agents, view
```

## 已实现的权限标识

| 资源 | 动作 | 说明 |
|------|------|------|
| `users` | `list/create/update/delete` | 用户管理 |
| `departments` | `list/view/create/update/delete` | 部门管理 |
| `instances` | `view/manage` | 实例管理 |
| `instance_access` | `manage` | 实例访问授权 |
| `agents` | `view/create/manage/classify` | Agent 管理 |
| `chat` | `use` | 聊天 |
| `sessions` | `view_own/view_dept/view_all` | 会话查看 |
| `skills` | `develop/manage_dept/manage_global` | Skill 管理 |
| `resources` | `manage` | 资源管理 |
| `audit` | `view_dept/view_all` | 审计日志 |
| `rbac` | `manage` | 角色权限管理 |

---

## 在路由中使用权限

```go
// GET 列表 → list
foos.GET("", middleware.RequirePermission(enforcer, "foos", "list"), h.List)

// GET 单个 → view（语义与 list 不同）
foos.GET("/:id", middleware.RequirePermission(enforcer, "foos", "view"), h.Get)

// 写操作 → create/update/delete
foos.POST("",      middleware.RequirePermission(enforcer, "foos", "create"), h.Create)
foos.PATCH("/:id", middleware.RequirePermission(enforcer, "foos", "update"), h.Update)
foos.DELETE("/:id",middleware.RequirePermission(enforcer, "foos", "delete"), h.Delete)
```

## 角色常量

```go
model.RoleSystemAdmin  // "SYSTEM_ADMIN"
model.RoleDeptAdmin    // "DEPT_ADMIN"
model.RoleUser         // "USER"

// 在 handler 中判断角色
isDeptAdmin(c)   // 当前用户是 DEPT_ADMIN
```

---

## 添加新权限的步骤

1. 在 `configs/rbac_policy.csv` 添加策略行
2. 在路由中使用 `middleware.RequirePermission(enforcer, "resource", "action")`
3. **无需重启**（策略文件挂载为 volume，重新加载 enforcer 即可）
   - 目前 enforcer 在启动时一次性加载，修改策略需 `make docker-restart`

---

## 调试策略匹配

```bash
# 直接在容器中测试 enforcer（未来可添加 /api/v1/rbac/check 端点）
docker exec tc-postgres psql -U teamclaw -d teamclaw \
  -c "SELECT role FROM users WHERE email='xxx@example.com';"

# 确认请求使用的 role 和 permission
make docker-logs  # 查看请求日志中的 403 原因
```

---

## 已知限制

- Casbin 策略变更后需重启 API 容器（`make docker-restart`）
- 计划迁移到 GORM adapter 实现动态策略（阶段四）
