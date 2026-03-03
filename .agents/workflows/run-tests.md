# 工作流：运行测试

参考 SKILL：`.agents/skills/testing/SKILL.md`

---

## ⚠️ 重要：正确的测试方式

**不要使用** `scripts/debug.sh`（不存在）或 `make docker-*`（未配置）。

### 实际测试方法

```bash
# 方法 A：临时 curl 容器（推荐，不污染宿主机）
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  curl -s http://tc-api:3200/api/v1/users -H "Authorization: Bearer $TOKEN"
'

# 方法 B：健康检查
docker exec tc-api wget -qO- http://localhost:3200/healthz
```

---

## 容器状态

| 容器名 | 镜像 | 用途 |
|--------|------|------|
| `tc-api` | `server-api` | Go 后端，端口 3200 |
| `tc-postgres` | `postgres:17` | 数据库，端口 5432 |
| `tc-redis` | `redis:7` | 缓存 |
| `tc-openclaw-test` | OpenClaw | 测试用 OpenClaw 实例 |

网络名：`teamclaw-dev`
API 内部地址：`http://tc-api:3200`（容器内访问）
API 外部地址：`http://localhost:3200`（宿主机访问）

---

## 测试账号

| 邮箱 | 密码 | 角色 |
|------|------|------|
| `admin@teamclaw.dev` | `TestPass@123` | SYSTEM_ADMIN |
| `bob@test.com` | `TestPass@123` | DEPT_ADMIN |
| `alice@test.com` | `TestPass@123` | USER |

---

## 重建 API 容器（代码修改后）

```bash
cd /c/teamclaw

# 1. 重新编译（强制不用缓存）
docker build --no-cache -t server-api ./server

# 2. 停止并删除旧容器
docker stop tc-api && docker rm tc-api

# 3. 用新镜像启动容器（参考 docker-compose.yml 中的环境变量）
docker run -d \
  --name tc-api \
  --network teamclaw-dev \
  -p 3200:3200 \
  -e "DATABASE_URL=postgres://teamclaw:devpass@tc-postgres:5432/teamclaw?sslmode=disable" \
  -e PORT=3200 \
  -e GIN_MODE=debug \
  -e ENCRYPTION_KEY=<从 docker inspect tc-api 获取> \
  -e JWT_PRIVATE_KEY=<从 docker inspect tc-api 获取> \
  -e JWT_PUBLIC_KEY=<从 docker inspect tc-api 获取> \
  server-api

# 4. 验证
docker exec tc-api wget -qO- http://localhost:3200/healthz
```

> **注意**：`docker restart` 和 `docker build` 不会更新容器使用的镜像！必须 stop/rm/run 三步。

---

## 快速验证流程

```bash
# 1. 检查容器状态
docker ps --filter name=tc --format "{{.Names}}\t{{.Status}}"

# 2. 以 admin 身份测试多个端点
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  echo "TOKEN_LEN=${#TOKEN}"

  echo "--- /healthz ---"
  curl -s http://tc-api:3200/healthz

  echo "--- GET /api/v1/auth/me ---"
  curl -s http://tc-api:3200/api/v1/auth/me -H "Authorization: Bearer $TOKEN" | grep -o "\"role\":\"[^\"]*\""

  echo "--- GET /api/v1/dashboard ---"
  curl -s http://tc-api:3200/api/v1/dashboard -H "Authorization: Bearer $TOKEN" | grep -o "\"totalUsers\":[0-9]*"

  echo "--- GET /api/v1/resources/providers ---"
  curl -s http://tc-api:3200/api/v1/resources/providers -H "Authorization: Bearer $TOKEN" | grep -o "\"id\":\"[^\"]*\"" | head -3
'
```

---

## 添加新端点后的验证清单

- [ ] 有效 token + 有权限 → 200 响应
- [ ] 无 token → 401
- [ ] 有效 token 但无权限的角色 → 403
- [ ] 无效请求体（缺少必填字段）→ 400
- [ ] 操作不存在的 ID → 404
- [ ] 重复创建（名称冲突）→ 409
- [ ] 分页参数正确（page=1&pageSize=10）
- [ ] DEPT_ADMIN 只能看到自己部门的数据

---

## 查看 API 日志

```bash
docker logs -f tc-api
docker logs -f tc-api | grep -E "ERROR|500|panic"
docker logs -f tc-api | grep "403"
```
