---
description: TeamClaw Docker 管理 — 开发环境启动、容器调试、Docker SDK 集成
---

# Docker 管理规范

## 开发环境架构

```
server/docker-compose.dev.yml
├── tc-postgres   PostgreSQL 17（端口 127.0.0.1:5432）
├── tc-redis      Redis 7（端口 127.0.0.1:6379）
└── tc-api        Go 后端（端口 0.0.0.0:3200）
                  挂载：./configs:/app/configs:ro
                  挂载：/var/run/docker.sock（Docker-in-Docker）
```

---

## 常用 Makefile 命令

```bash
cd server

make docker-up        # 构建并启动全部服务（后台）
make docker-down      # 停止所有服务（保留数据卷）
make docker-reset     # 停止并删除数据卷（清空 DB）
make docker-restart   # 仅重启 api 容器（代码改动后）
make docker-logs      # 跟踪 api 容器日志（Ctrl+C 退出）
make docker-build     # 仅构建 api 镜像（不启动）
make docker-ps        # 查看容器状态
```

---

## Dockerfile 说明（`server/Dockerfile`）

多阶段构建，生产镜像 ≈ 20MB：

```dockerfile
# Stage 1: 编译
FROM golang:1.25-alpine AS builder
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o teamclaw-server ./cmd/server

# Stage 2: 运行时
FROM alpine:3.20
COPY --from=builder /build/teamclaw-server .
COPY --from=builder /build/configs ./configs   # 复制 rbac_policy.csv 等
```

**注意**：configs 目录同时通过 volume 挂载覆盖，确保策略文件修改无需重建镜像（但仍需 `make docker-restart`）。

---

## 环境变量配置

```bash
# 首次初始化
cd server
make gen-env          # 生成 .env（RSA 密钥 + AES 密钥）

# 验证 .env 存在
ls -la server/.env
```

`docker-compose.dev.yml` 中 `env_file: .env`，并用 `environment:` 块覆盖 DATABASE_URL / REDIS_URL 为容器内地址：

```yaml
environment:
  - DATABASE_URL=postgres://teamclaw:devpass@postgres:5432/teamclaw?sslmode=disable
  - REDIS_URL=redis://redis:6379
```

---

## 调试容器内部

```bash
# 进入 api 容器
docker exec -it tc-api sh

# 查看 postgres 数据
docker exec -it tc-postgres psql -U teamclaw -d teamclaw

# 常用 psql 命令
\dt                                 # 列出所有表
SELECT * FROM users;                # 查看用户
SELECT * FROM refresh_tokens;       # 查看 token
UPDATE users SET role='SYSTEM_ADMIN' WHERE email='xxx@example.com';

# 查看 Redis
docker exec -it tc-redis redis-cli
KEYS *
GET <key>
```

---

## Docker SDK 集成（阶段三，待实现）

规划路径：`server/internal/service/docker/`

```go
// 推荐使用 Docker 官方 Go SDK
import "github.com/docker/docker/client"

cli, err := client.NewClientWithOpts(
    client.FromEnv,
    client.WithAPIVersionNegotiation(),
)
```

### 计划中的 Docker 操作

| 操作 | SDK 方法 |
|------|---------|
| 拉取镜像 | `cli.ImagePull()` |
| 创建容器 | `cli.ContainerCreate()` |
| 启动容器 | `cli.ContainerStart()` |
| 停止容器 | `cli.ContainerStop()` |
| 获取日志 | `cli.ContainerLogs()` |
| 获取状态 | `cli.ContainerInspect()` |
| 删除容器 | `cli.ContainerRemove()` |

### 安全注意事项

- Docker socket（`/var/run/docker.sock`）已挂载到 api 容器
- 生产环境应使用 **Docker Proxy 微服务** 限制可执行操作
- 容器名/网络名应使用命名空间前缀（如 `tc-instance-{id}`）

---

## 常见问题排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `api` 容器退出 | `.env` 缺少必填环境变量 | `make docker-logs` 查看启动错误 |
| port 3200 占用 | 本地已有进程 | `lsof -i :3200` 找到并 kill |
| postgres 连接失败 | postgres 容器未就绪 | `make docker-ps` 查看健康状态 |
| `go build` 失败 | 代码编译错误 | `make docker-logs` 中有 Go 编译输出 |
| Casbin 策略不生效 | 修改 csv 后未重启 | `make docker-restart` |
