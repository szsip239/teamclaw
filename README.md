<p align="center">
  <h1 align="center">TeamClaw</h1>
  <p align="center">Enterprise OpenClaw AI Agent Management Platform</p>
  <p align="center">企业级 OpenClaw AI Agent 管理平台</p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://go.dev/"><img src="https://img.shields.io/badge/go-1.23+-00ADD8.svg" alt="Go"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-green.svg" alt="Node.js"></a>
</p>

<p align="center">
  <a href="#english">English</a> | <a href="#中文">中文</a>
</p>

---

<a id="中文"></a>

## TeamClaw 是什么？

TeamClaw 是基于 [OpenClaw](https://github.com/anthropics/openclaw)（🦞）构建的全功能管理平台，提供 OpenClaw 目前不具备的企业级能力。

### 核心功能

**AI 对话**
- 多会话管理 — 每个 Agent 支持创建多个独立对话
- 流式输出 — 逐 Token 实时显示回复内容
- 思考过程 — 可折叠展示 LLM 的推理链路
- 上下文管理 — 对话历史快照与上下文重置

**Agent 管理**
- 跨实例 Agent 浏览与创建，支持克隆到不同实例
- 分类体系 — DEFAULT / DEPARTMENT / PERSONAL 三级分类
- 可视化配置编辑器 — Schema 驱动的表单，覆盖所有 OpenClaw 模块

**Skills 市场**
- 技能开发 — 本地创建和管理技能包
- 版本管理 — 安装追踪与版本记录
- 作用域控制 — PERSONAL / DEPARTMENT / DEFAULT 三级作用域

**多实例管理**
- Docker 一键创建 — 配置镜像、端口、绑定即可部署
- 外部网关接入 — 通过 URL + Token 连接已有 OpenClaw 实例
- 健康监控 — 60 秒周期检查，自动故障检测与实例恢复
- 生命周期管理 — 启动、停止、重启，实时日志查看

**组织与权限**
- RBAC 角色体系 — SYSTEM_ADMIN / DEPT_ADMIN / USER 三级权限
- 部门隔离 — 按部门分配实例和 Agent 访问权限
- 审计日志 — 全量操作追踪，支持筛选与 CSV 导出

**平台能力**
- 完整国际化 — 中英文界面一键切换
- 多模型支持 — Anthropic、OpenAI、SiliconFlow、Ollama 等 10+ 提供商
- Docker 部署 — 一条命令启动全栈服务

---

## 快速开始

### 前提条件

- [Docker](https://docs.docker.com/get-docker/) 24+（含 Docker Compose）
- `openssl`（密钥生成，macOS/Linux 自带）

### 一键部署

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
bash setup.sh
```

脚本会自动：
1. 生成 JWT RS256 密钥对和 AES-256 加密密钥
2. 询问是否启用 Nginx HTTPS 反向代理（可选，需要 SSL 证书）
3. 通过 Docker Compose 构建并启动所有服务
4. 等待服务就绪并验证健康状态

**访问地址：** `http://localhost:3100`

**默认管理员账号：**
- 邮箱：`admin@teamclaw.local`
- 密码：`Admin@123456`

> 首次登录后请立即修改默认密码。

---

## 首次使用指南

### 1. 登录

访问 `http://localhost:3100`，使用默认账号登录。

### 2. 配置模型 API 密钥

进入 **资源管理** 页面，创建模型资源：

| 提供商 | API 协议 |
|--------|----------|
| Anthropic | `anthropic-messages` |
| OpenAI | `openai-completions` |
| Google Gemini | `google-generative-ai` |
| DeepSeek | `openai-completions` |
| SiliconFlow | `openai-completions` |
| Ollama（本地）| `ollama` |

点击 **创建资源** → 选择提供商 → 填入 API Key → 保存。可勾选"设为默认"。

### 3. 部署 OpenClaw 实例

进入 **实例管理**，选择以下任一方式：

- **Docker 容器**：点击"创建实例"，填写名称，选择镜像（默认 `alpine/openclaw:latest`），一键部署
- **外部网关**：填入已运行的 OpenClaw 的 WebSocket URL 和 Token

等待实例状态变为 🟢 **ONLINE**（通常 10-30 秒）。

### 4. 开始对话

进入 **AI 对话** — 实例上线后，Agent 自动出现在左侧栏。点击即可对话。

```
✅ 登录 → 配置 API Key → 创建实例 → 开始对话（约 3 分钟）
```

---

## 系统架构

```
浏览器
  │
  ├── / (UI)      → Next.js (port 3100)
  └── /api/v1/*   → Go API (port 3200)   ← 由 Next.js rewrites 或 Nginx 代理
                         │
                    ┌────┴────┐
                    │PostgreSQL│  │ Redis │
                    └─────────┘  └───────┘
                         │
                    Gateway Registry (WebSocket)
                         │
                  OpenClaw 实例 (Docker / 外部)
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router, React 19) |
| UI 组件 | Tailwind CSS 4, shadcn/ui |
| 状态管理 | Zustand 5, TanStack Query v5 |
| **后端** | **Go 1.23+, Gin, GORM** |
| **认证** | **RS256 JWT + Casbin RBAC** |
| 数据库 | PostgreSQL 17 |
| 缓存 | Redis 7 |
| 网关通信 | WebSocket (gorilla/websocket) |
| Docker 管理 | Docker daemon REST API（零依赖） |

---

## 高级配置

### 启用 HTTPS（可选）

`setup.sh` 会交互式询问是否启用 Nginx HTTPS 反代。也可手动配置：

1. 将 SSL 证书放入 `nginx/cert/`
2. 编辑 `.env` 配置 Nginx 变量
3. 启动时添加 `--profile nginx`：
   ```bash
   docker compose -f docker-compose.prod.yml --profile nginx up -d
   ```

### 主要环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_PORT` | 前端端口 | `3100` |
| `JWT_PRIVATE_KEY` | JWT RSA 私钥（Base64 PEM）| 由 setup.sh 生成 |
| `JWT_PUBLIC_KEY` | JWT RSA 公钥（Base64 PEM）| 由 setup.sh 生成 |
| `ENCRYPTION_KEY` | AES-256 密钥（64位十六进制）| 由 setup.sh 生成 |
| `POSTGRES_PASSWORD` | 数据库密码 | `teamclaw_dev_2024` |

---

## 本地开发

```bash
# 1. 克隆并安装前端依赖
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
npm install

# 2. 启动数据库服务
docker compose up -d

# 3. 配置开发环境变量
cp .env.example .env.local
# 编辑 .env.local：
#   NEXT_PUBLIC_API_URL=http://localhost:3200  （Go API 直连）
#   JWT_PRIVATE_KEY / JWT_PUBLIC_KEY / ENCRYPTION_KEY

# 4. 启动 Go API 后端（另一个终端）
cd server
go run ./cmd/server

# 5. 启动 Next.js 前端
cd ..
npm run dev
```

访问 `http://localhost:3000`

---

## 贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)

---

<a id="english"></a>

## What is TeamClaw?

TeamClaw is a full-featured management platform built on top of [OpenClaw](https://github.com/anthropics/openclaw) (🦞). It provides enterprise-grade capabilities that OpenClaw's native dashboard doesn't offer.

### Core Features

- **AI Chat** — Multi-session streaming chat with thinking-process display
- **Agent Management** — Cross-instance CRUD, classification, visual config editor
- **Skills Marketplace** — Local skill development with version tracking
- **Multi-Instance** — Docker-based creation + external gateway, health monitoring
- **RBAC** — SYSTEM_ADMIN / DEPT_ADMIN / USER roles, department isolation, audit logs

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (React 19), Tailwind CSS 4, shadcn/ui |
| **Backend** | **Go 1.23+, Gin, GORM** |
| **Auth** | **RS256 JWT + Casbin RBAC** |
| Database | PostgreSQL 17 |
| Cache | Redis 7 |
| Gateway | WebSocket (gorilla/websocket) |

## Quick Start

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
bash setup.sh
```

Visit `http://localhost:3100` — Login: `admin@teamclaw.local` / `Admin@123456`

> Change the default password after first login.

## Local Development

```bash
# Start databases
docker compose up -d

# Terminal 1 — Go API backend
cd server && go run ./cmd/server

# Terminal 2 — Next.js frontend
npm install && npm run dev
# Set NEXT_PUBLIC_API_URL=http://localhost:3200 in .env.local
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
