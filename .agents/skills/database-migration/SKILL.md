---
description: TeamClaw GORM 数据库操作 — 模型定义、迁移、常见查询模式
---

# 数据库操作规范

## 当前状态

- **ORM**：GORM v2 + PostgreSQL 17
- **迁移方式**：`AutoMigrate`（启动时自动同步 schema）
- **模型文件**：`server/internal/model/models.go`（14 个模型集中在一文件）
- **ID 类型**：CUID 字符串（`model.GenerateID()`），非自增整数

---

## BaseModel（所有模型的基础）

```go
type BaseModel struct {
    ID        string         `gorm:"primaryKey" json:"id"`
    CreatedAt time.Time      `json:"createdAt"`
    UpdatedAt time.Time      `json:"updatedAt"`
    DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`  // 软删除
}
```

创建新记录时：

```go
// handler/helpers.go
func newBaseModel() model.BaseModel {
    return model.BaseModel{
        ID:        model.GenerateID(),
        CreatedAt: time.Now(),
        UpdatedAt: time.Now(),
    }
}

// 在 handler 中使用
foo := model.Foo{
    BaseModel: newBaseModel(),
    Name:      req.Name,
}
h.db.Create(&foo)
```

---

## 14 个 GORM 模型清单

| 模型 | 表名 | 关键字段 |
|------|------|---------|
| `User` | `users` | email, name, role, departmentId, passwordHash |
| `Department` | `departments` | name |
| `RefreshToken` | `refresh_tokens` | userId, tokenHash, expiresAt, revoked |
| `AuditLog` | `audit_logs` | userId, action, resource, resourceId, metadata, ip |
| `Instance` | `instances` | name, gatewayUrl, gatewayToken(AES), status, dockerConfig(JSONB) |
| `InstanceAccess` | `instance_accesses` | instanceId, departmentId, agentIds(JSONB) |
| `ChatSession` | `chat_sessions` | userId, instanceId, agentId, title |
| `ChatMessageSnapshot` | `chat_message_snapshots` | sessionId, role, content |
| `AgentMeta` | `agent_metas` | instanceId, agentId, name, category, config(JSONB) |
| `Skill` | `skills` | name, category, source, currentVersionId |
| `SkillVersion` | `skill_versions` | skillId, version, content |
| `SkillInstallation` | `skill_installations` | skillId, instanceId |
| `Resource` | `resources` | name, type, credentials(AES), status |
| `SystemConfig` | `system_configs` | key, value |

---

## 常用 GORM 操作模式

### 创建

```go
record := model.Foo{BaseModel: newBaseModel(), Name: req.Name}
if err := h.db.Create(&record).Error; err != nil {
    response.InternalError(c, "failed to create foo")
    return
}
response.Created(c, record.ToResponse())
```

### 列表（分页）

```go
page, pageSize := ParsePagination(c)
var items []model.Foo
var total int64

query := h.db.Model(&model.Foo{})
// 加过滤条件
if name := c.Query("name"); name != "" {
    query = query.Where("name ILIKE ?", "%"+name+"%")
}

query.Count(&total)
query.Offset((page-1)*pageSize).Limit(pageSize).Find(&items)

resp := make([]model.FooResponse, len(items))
for i, item := range items {
    resp[i] = item.ToResponse()
}
response.List(c, resp, total, page, pageSize)
```

### 获取单条

```go
var foo model.Foo
if err := h.db.First(&foo, "id = ?", id).Error; err != nil {
    if errors.Is(err, gorm.ErrRecordNotFound) {
        response.NotFound(c, "foo not found")
    } else {
        response.InternalError(c, "database error")
    }
    return
}
```

### 更新（使用 map 避免零值问题）

```go
updates := map[string]any{}
if req.Name != "" { updates["name"] = req.Name }

if len(updates) == 0 {
    response.BadRequest(c, "no fields to update")
    return
}
if err := h.db.Model(&foo).Updates(updates).Error; err != nil {
    response.InternalError(c, "failed to update foo")
    return
}
// 必须重新查询！Updates() 不刷新结构体
h.db.First(&foo, "id = ?", foo.ID)
response.OK(c, foo.ToResponse())
```

### 软删除

```go
if err := h.db.Delete(&foo).Error; err != nil {
    response.InternalError(c, "failed to delete foo")
    return
}
response.OK(c, nil)
```

---

## JSONB 字段处理

```go
// 模型定义（存储为 *string）
type Instance struct {
    DockerConfig *string `gorm:"type:text"`
}

// 写入（使用 RawJSON helper）
instance.DockerConfig = RawJSON(req.DockerConfig)  // json.RawMessage → *string

// 读取（返回时直接 base64 json 即可，前端解析）
```

---

## AES 加密字段

```go
// 写入前加密
encrypted, err := h.enc.Encrypt(req.GatewayToken)
if err != nil {
    response.InternalError(c, "failed to encrypt token")
    return
}
instance.GatewayToken = encrypted

// 读取时解密（仅在需要实际使用 token 时）
plaintext, err := h.enc.Decrypt(instance.GatewayToken)

// 永远不要在 HTTP 响应中返回加密字段！
```

---

## IN 查询空值守卫

```go
// 错误：IN () 在 PostgreSQL 中是无效 SQL
h.db.Where("id IN ?", ids).Find(&items)  // 如果 ids 为空会报错

// 正确：先守卫
if len(ids) == 0 {
    response.List(c, []model.FooResponse{}, 0, page, pageSize)
    return
}
h.db.Where("id IN ?", ids).Find(&items)
```

---

## 唯一性检查（Update 时排除自身）

```go
// 检查 name 是否与其他记录冲突
var count int64
h.db.Model(&model.Foo{}).
    Where("name = ? AND id != ?", req.Name, id).
    Count(&count)
if count > 0 {
    response.Conflict(c, "name already exists")
    return
}
```

---

## 数据库调试

```bash
# 连接数据库
docker exec -it tc-postgres psql -U teamclaw -d teamclaw

# 查看表结构
\d users
\d instances

# 查看慢查询（需开启 pg_stat_statements）
SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;

# 查看 GORM 生成的 SQL（在代码中开启）
h.db.Debug().Find(&items)   # 临时调试，不要提交
```
