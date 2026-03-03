---
description: TeamClaw Go 后端测试 — 集成测试、API 验证、调试方法
---

# 测试规范

## 当前状态

- **正式单元测试**：尚未实现（技术债）
- **集成测试脚本**：`server/scripts/integration-test.sh`（15 个测试用例）
- **API 验证**：通过 `docker run --rm --network teamclaw-dev alpine/curl` 执行

---

## ⚠️ 正确的 API 测试方式

```bash
# 在 Docker 网络内访问 tc-api（不是 localhost:3200）
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  # 1. 获取 token
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")

  # 2. 调用接口
  curl -s http://tc-api:3200/api/v1/users -H "Authorization: Bearer $TOKEN"
'
```

## 测试账号

| 邮箱 | 密码 | 角色 |
|------|------|------|
| `admin@teamclaw.dev` | `TestPass@123` | SYSTEM_ADMIN |
| `bob@test.com` | `TestPass@123` | DEPT_ADMIN |
| `alice@test.com` | `TestPass@123` | USER |

---

## 健康检查

```bash
docker exec tc-api wget -qO- http://localhost:3200/healthz
# 期望：{"status":"ok"}
```

---

## 常用验证场景

```bash
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")

  # Auth
  curl -s http://tc-api:3200/api/v1/auth/me -H "Authorization: Bearer $TOKEN"

  # 仪表盘（新路由 /dashboard，不是 /dashboard/stats）
  curl -s http://tc-api:3200/api/v1/dashboard -H "Authorization: Bearer $TOKEN"

  # 用户
  curl -s http://tc-api:3200/api/v1/users -H "Authorization: Bearer $TOKEN"

  # 实例
  curl -s http://tc-api:3200/api/v1/instances -H "Authorization: Bearer $TOKEN"

  # 聊天会话
  curl -s http://tc-api:3200/api/v1/chat/sessions -H "Authorization: Bearer $TOKEN"

  # 资源供应商（来自后端静态列表）
  curl -s http://tc-api:3200/api/v1/resources/providers -H "Authorization: Bearer $TOKEN"
'
```

---

## 重建 API 容器

```bash
cd /c/teamclaw

# 强制不用缓存重编译
docker build --no-cache -t server-api ./server

# ⚠️ docker restart 不会更新镜像，必须三步
docker stop tc-api && docker rm tc-api && docker run -d \
  --name tc-api --network teamclaw-dev -p 3200:3200 \
  -e "DATABASE_URL=postgres://teamclaw:devpass@tc-postgres:5432/teamclaw?sslmode=disable" \
  -e PORT=3200 -e GIN_MODE=debug \
  -e ENCRYPTION_KEY=<key> \
  -e JWT_PRIVATE_KEY=<key> \
  -e JWT_PUBLIC_KEY=<key> \
  server-api

docker exec tc-api wget -qO- http://localhost:3200/healthz
```

---

## 查看日志

```bash
# 实时日志
docker logs -f tc-api

# 过滤错误
docker logs tc-api 2>&1 | grep -E "ERROR|panic|500"

# 过滤权限错误
docker logs tc-api 2>&1 | grep "403"

# 查看最近 100 行
docker logs --tail 100 tc-api
```

---

## 验证清单（新端点）

- [ ] 有效 token + 有权限 → 200
- [ ] 无 token → 401
- [ ] 有效 token + 无权限角色 → 403
- [ ] 无效请求体 → 400
- [ ] 不存在的 ID → 404
- [ ] 重复创建 → 409
- [ ] 分页正确（`page=1&pageSize=10`）
- [ ] DEPT_ADMIN 数据隔离

---

## 数据库直连

```bash
docker exec tc-postgres psql -U teamclaw -d teamclaw -c "SELECT id, email, role FROM users;"
docker exec tc-postgres psql -U teamclaw -d teamclaw -c "SELECT id, name, status FROM instances;"
```
