<p align="center">
  <img src="docs/screenshots/cover.png" alt="TeamClaw Cover" width="800">
</p>

<p align="center">
  <h1 align="center">TeamClaw</h1>
  <p align="center">Enterprise OpenClaw AI Agent Management Platform</p>
  <p align="center">企业级 OpenClaw AI Agent 管理平台</p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D20-green.svg" alt="Node.js"></a>
  <a href="https://github.com/szsip239/teamclaw/pkgs/container/teamclaw"><img src="https://img.shields.io/badge/ghcr.io-teamclaw-blue.svg" alt="Docker Image"></a>
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
- 图片附件 — 支持发送图片（PNG/JPEG/GIF/WebP，最大 5MB）
- 上下文管理 — 对话历史快照与上下文重置

**Agent 管理**
- 跨实例 Agent 浏览与创建，支持克隆到不同实例
- 分类体系 — DEFAULT / DEPARTMENT / PERSONAL 三级分类
- 文件管理 — 树形浏览与在线编辑 Agent 配置文件
- 可视化配置编辑器 — Schema 驱动的表单，覆盖所有 OpenClaw 模块

**Skills 市场**
- ClawHub 集成 — 从公共市场搜索、安装和更新技能包
- 技能开发 — IDE 风格的文件编辑器，本地开发后发布到 ClawHub
- 版本管理 — 安装追踪、版本检查与一键升级
- 作用域控制 — 支持 PERSONAL / DEPARTMENT / GLOBAL 三级作用域

**知识库 (RAG)**
- 文档上传 — 支持 PDF、DOCX、TXT、Markdown，自动 OCR 与分块
- 语义检索 — 基于 pgvector 向量相似度搜索，支持流式问答
- 作用域管理 — PERSONAL / DEPARTMENT / GLOBAL 三级知识库隔离
- 智能复用 — 同一知识库内自动复用已有文档的 OCR 结果

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
- 移动端适配 — 手机浏览器完整对话体验，侧边栏和文件面板以抽屉形式展开
- PWA 支持 — 支持添加到主屏幕，独立窗口运行
- 多模型支持 — Anthropic、OpenAI、MiniMax、Groq 等
- Docker 部署 — 一条命令启动全栈服务

## 快速开始

> **⚠️ 重要提示**：TeamClaw 依赖 PostgreSQL 和 Redis，**不支持**单独 `docker run` 启动。请使用下面的 Docker Compose 方式部署。

### 方式一：Docker Compose 部署（推荐）

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
bash setup.sh
```

脚本会自动：
1. 生成 JWT 密钥对和加密密钥
2. 询问是否启用 Nginx HTTPS 反向代理（可选）
3. 通过 Docker Compose 启动 PostgreSQL、Redis 和 TeamClaw
4. 初始化数据库并创建默认管理员账号

访问 `http://localhost:3100` — 账号：`admin@teamclaw.local` / `Admin@123456`

#### 启用 HTTPS（可选）

`setup.sh` 会交互式询问是否启用 Nginx 反向代理。你也可以手动配置：

1. 将 SSL 证书文件放入 `nginx/cert/` 目录
2. 编辑 `.env` 设置 Nginx 变量：
   ```
   NGINX_SERVER_NAME="your-domain.com"
   NGINX_SSL_CERT="your-cert.crt"
   NGINX_SSL_KEY="your-cert.key"
   ```
3. 使用 `--profile nginx` 启动：
   ```bash
   docker compose -f docker-compose.prod.yml --profile nginx up -d
   ```

访问 `https://your-domain.com`

### 方式二：本地开发

```bash
# 1. 克隆并安装依赖
git clone https://github.com/anthropics/teamclaw.git
cd teamclaw
npm install

# 2. 启动数据库服务
docker compose up -d

# 3. 配置环境变量
cp .env.example .env
node scripts/generate-keys.mjs

# 4. 初始化数据库
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# 5. 启动开发服务器
npm run dev
```

## 首次使用指南

部署完成后，按以下步骤开始你的第一次 AI 对话：

### 1. 登录管理面板

访问 `http://localhost:3100`，使用默认管理员账号登录：

- 邮箱：`admin@teamclaw.local`
- 密码：`Admin@123456`

> 建议首次登录后立即修改默认密码。

### 2. 配置模型资源（**建议先做，再创建实例**）

进入 **资源管理** 页面，创建模型资源。我们支持 25 个内置 Provider，包括多区域 / 多计划 variants（例如 qwen 的"国内 Standard"、"国内 Coding Plan"、"国际 Standard"、"国际 Coding Plan"）：

| 提供商 | API 协议 | 说明 |
|--------|----------|------|
| Anthropic | `anthropic-messages` | Claude 系列，默认提供商 |
| OpenAI | `openai-completions` | GPT / o 系列 |
| Google | `google-generative-ai` | Gemini 系列 |
| DeepSeek | `openai-completions` | DeepSeek V3 / R1 |
| Qwen（通义千问） | `openai-completions` | 含 Coding Plan 变体 |
| MiniMax / Doubao / Moonshot | 多种 | 含多 region 变体 |
| Groq / xAI / Mistral | `openai-completions` | OpenAI 兼容协议 |
| Ollama / vLLM | `ollama` / `openai-completions` | 本地部署 |

> 完整支持 25 个 Provider（智谱 GLM、千帆、z.ai、Kimi Coding 等），详见资源管理页面。

**操作流程**：

1. 点击 **创建资源** → 选择 Provider → 如有 variants，二级下拉选 region/plan → 填入 API Key → 保存
2. 进入资源详情 → **Model 列表** → 点击其中一个模型右侧的 ⭐ **星标**，将它设为"新实例默认模型"
3. 回到资源卡片，勾选 **"设为默认"**（让该 Resource 作为 provider 的首选 key）

**为什么要先做这一步？** 从 v0.4.0 开始，teamclaw 会在新实例首次连接时**自动**把"默认 Resource + 默认模型"推送到实例配置里：

```
先配资源（设 ⭐ + "设为默认"）
   ↓
后创建实例
   ↓
实例首次 WebSocket 连接 → teamclaw 自动注入 models.providers + primary model
   ↓
开箱即用，无需在 Config Editor 手配
```

### 3. 部署 OpenClaw 实例

进入 **实例管理** 页面，选择以下任一方式：

**Docker 容器（推荐）** — 点击"创建实例"，选择 Docker 模式，填写实例名称，选择镜像（默认 `alpine/openclaw:latest`），点击创建即可自动部署。实例上线后会**自动**使用步骤 2 中你标记的默认资源与默认模型。

**外部网关** — 如果已有运行中的 OpenClaw，选择外部网关模式，填入 WebSocket URL 和 Token 即可连接。已有模型配置的实例不会被覆盖，你可以通过 Config Editor 手动切换默认模型。

等待实例状态变为 🟢 **ONLINE**（通常 5-10 秒）。

### 4. 开始对话

进入 **AI 对话** 页面 — 实例上线后，默认 Agent 会自动出现在左侧栏。点击 Agent 即可开始对话。

```
✅ 登录 → 配置资源（⭐ 默认模型）→ 创建实例（自动绑定）→ 开始对话（约 2 分钟）
```

### 5. 安装预置 Skills（可选）

v0.4.0 预置了 15 个开箱即用的参考 Skills，涵盖浏览器自动化、内容创作、数据分析、多搜索引擎等场景：

| 类别 | Skills |
|---|---|
| 浏览器自动化 | `agent-browser`、`browserwing`、`playwright-scraper-skill` |
| 搜索 | `baidu-search`、`multi-search-engine`、`vane-search` |
| 内容创作 | `anygen-skill`、`content-skills`（含包鱼 Markdown→公众号 / Markdown→HTML） |
| 数据分析 | `data-analyst` |
| 工作流辅助 | `agent-init`、`multi-agent-cn`、`self-improving`、`skill-creator`、`summarize` |
| 商务 | `qcc-cli`（企查查） |

**安装方法**：进入 **Skills 管理** 页面 → 选择 skill → 点击"安装到实例" → 选目标实例 / agent / 安装路径（workspace 或 global）。

## 系统架构

```mermaid
graph TB
    subgraph Client["浏览器"]
        Chat["AI 对话"]
        AgentUI["Agent 管理"]
        SkillUI["Skills 市场"]
        ConfigUI["配置编辑器"]
        OrgUI["组织管理"]
    end

    NextJS["Next.js 16 (App Router)"]

    subgraph Backend["后端服务"]
        API["REST API (57 个路由)"]
        GW["Gateway Registry<br/>WebSocket 连接池"]
        Health["健康监控<br/>60s 检查 + 自动恢复"]
    end

    subgraph Storage["存储"]
        PG["PostgreSQL 17 + pgvector<br/>14 个数据模型"]
        RD["Redis 7<br/>限流 + 健康计数"]
    end

    RAG["RAG Service<br/>文档解析 + 向量检索"]

    subgraph Instances["OpenClaw 实例"]
        OC1["实例 1 (Docker)"]
        OC2["实例 2 (Docker)"]
        OCN["实例 N (外部网关)"]
    end

    DK["Docker Engine"]

    Client --> NextJS
    NextJS --> API
    API --> GW
    API --> PG
    API --> RD
    API -- "文档/检索" --> RAG
    RAG --> PG
    GW --> Health
    GW -- "WebSocket" --> OC1
    GW -- "WebSocket" --> OC2
    GW -- "WebSocket" --> OCN
    API -. "容器管理" .-> DK
    DK -. "创建/启停" .-> OC1
    DK -. "创建/启停" .-> OC2

    style Client fill:#e3f2fd
    style NextJS fill:#fff3e0
    style Backend fill:#e8f5e9
    style Storage fill:#fce4ec
    style RAG fill:#fff9c4
    style Instances fill:#f3e5f5
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| 前端 | React 19, Tailwind CSS 4, shadcn/ui |
| 状态管理 | Zustand 5, TanStack Query v5 |
| 数据库 | PostgreSQL 17 + Prisma 7 (Driver Adapter) + pgvector |
| RAG | Python FastAPI + pgvector 向量检索 |
| 缓存 | Redis 7 (ioredis) |
| 认证 | RS256 JWT (jose) + bcryptjs |
| 网关通信 | WebSocket (ws) + Docker API (dockerode) |
| 数据验证 | Zod 4 |

### 功能概览

| 模块 | 路由数 | 核心能力 |
|------|--------|---------|
| 对话 | 8 | 多会话、流式输出、思考展示、图片附件 |
| Agent | 6 | CRUD、克隆、分类、文件管理 |
| Skills | 12 | ClawHub 市场、安装/发布、版本管理、IDE 编辑 |
| 实例 | 13 | Docker 创建、外部接入、健康监控、配置编辑 |
| 知识库 | 8 | 文档上传、OCR、语义检索、流式问答、作用域管理 |
| 认证 | 5 | JWT 登录、Token 轮转、限流 |
| 组织 | 5 | 用户/部门 CRUD、RBAC 权限 |
| 审计 | 2 | 操作日志、CSV 导出 |
| 仪表盘 | 1 | 实例/会话/用户/技能统计 |
| 其他 | 5 | 资源密钥、实例访问 |

## 界面截图

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/dashboard.png" width="400"><br><b>仪表盘</b></td>
    <td align="center"><img src="docs/screenshots/chat.png" width="400"><br><b>AI 对话</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/agents.png" width="400"><br><b>Agent 管理</b></td>
    <td align="center"><img src="docs/screenshots/skills.png" width="400"><br><b>Skills 管理</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/instances.png" width="400"><br><b>实例管理</b></td>
    <td align="center"><img src="docs/screenshots/config-editor.png" width="400"><br><b>配置编辑器</b></td>
  </tr>
</table>

## 贡献

详见 [CONTRIBUTING.md](CONTRIBUTING.md)，了解开发环境搭建、代码规范和 PR 流程。

## 许可证

[MIT](LICENSE)

---

<a id="english"></a>

## What is TeamClaw?

TeamClaw is a full-featured management platform built on top of [OpenClaw](https://github.com/anthropics/openclaw) — 🦞the open-source AI Agent gateway🦞. It provides enterprise-grade capabilities that OpenClaw's native dashboard doesn't offer.

### Core Features

**AI Chat**
- Multi-conversation — create multiple independent sessions per agent
- Streaming responses — real-time token-by-token display
- Thinking process — collapsible LLM reasoning chain display
- Image attachments — send images with messages (PNG/JPEG/GIF/WebP, max 5MB)
- Context management — conversation snapshots and context reset

**Agent Management**
- Cross-instance agent browsing and creation, with cloning to other instances
- Classification — DEFAULT / DEPARTMENT / PERSONAL categories
- File management — tree view with online editing of agent config files
- Visual config editor — schema-driven forms covering all OpenClaw modules

**Skills Marketplace**
- ClawHub integration — search, install, and update skill packages from public marketplace
- Skill development — IDE-style file editor, develop locally and publish to ClawHub
- Version management — installation tracking, version checks, and one-click upgrades
- Scope control — PERSONAL / DEPARTMENT / GLOBAL skill scopes

**Knowledge Base (RAG)**
- Document upload — PDF, DOCX, TXT, Markdown with automatic OCR and chunking
- Semantic search — pgvector-powered similarity search with streaming Q&A
- Scope management — PERSONAL / DEPARTMENT / GLOBAL knowledge base isolation
- Smart reuse — automatically reuse OCR output from previous documents in the same KB

**Multi-Instance Management**
- One-click Docker creation — configure image, ports, bind settings and deploy
- External gateway — connect existing OpenClaw instances via URL + token
- Health monitoring — 60-second periodic checks with automatic fault detection and recovery
- Lifecycle control — start, stop, restart, with real-time log streaming

**Organization & Permissions**
- RBAC — SYSTEM_ADMIN / DEPT_ADMIN / USER three-tier roles
- Department isolation — assign instance and agent access per department
- Audit logs — comprehensive operation tracking with filtering and CSV export

**Platform**
- Full i18n — English and Chinese interface with one-click switching
- Mobile-responsive — full chat experience on mobile browsers with sidebar and file panel as slide-in drawers
- PWA support — add to home screen, runs in standalone mode
- Multi-model support — Anthropic, OpenAI, MiniMax, Groq, and more
- Docker deployment — one-command full-stack setup

## Quick Start

> **⚠️ Important**: TeamClaw requires PostgreSQL and Redis. Standalone `docker run` will **NOT** work. Use Docker Compose as described below.

### Option 1: Docker Compose (Recommended)

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
bash setup.sh
```

This will:
1. Generate JWT keys and encryption secrets
2. Ask whether to enable Nginx HTTPS reverse proxy (optional)
3. Start PostgreSQL, Redis, and TeamClaw via Docker Compose
4. Initialize the database with default admin account

Visit `http://localhost:3100` — Login: `admin@teamclaw.local` / `Admin@123456`

#### Enable HTTPS (Optional)

`setup.sh` interactively asks whether to enable Nginx reverse proxy. You can also configure it manually:

1. Place SSL certificate files in `nginx/cert/`
2. Edit `.env` to set Nginx variables:
   ```
   NGINX_SERVER_NAME="your-domain.com"
   NGINX_SSL_CERT="your-cert.crt"
   NGINX_SSL_KEY="your-cert.key"
   ```
3. Start with `--profile nginx`:
   ```bash
   docker compose -f docker-compose.prod.yml --profile nginx up -d
   ```

Visit `https://your-domain.com`

### Option 2: Local Development

```bash
# 1. Clone and install
git clone https://github.com/anthropics/teamclaw.git
cd teamclaw
npm install

# 2. Start databases
docker compose up -d

# 3. Configure environment
cp .env.example .env
node scripts/generate-keys.mjs

# 4. Setup database
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

# 5. Start dev server
npm run dev
```

## Architecture

```mermaid
graph TB
    subgraph Client["Browser"]
        Chat["AI Chat"]
        AgentUI["Agent Mgmt"]
        SkillUI["Skills Market"]
        ConfigUI["Config Editor"]
        OrgUI["Org Mgmt"]
    end

    NextJS["Next.js 16 (App Router)"]

    subgraph Backend["Backend"]
        API["REST API (57 routes)"]
        GW["Gateway Registry<br/>WebSocket Pool"]
        Health["Health Monitor<br/>60s Check + Auto Recovery"]
    end

    subgraph Storage["Storage"]
        PG["PostgreSQL 17 + pgvector<br/>14 Data Models"]
        RD["Redis 7<br/>Rate Limit + Health Counter"]
    end

    RAG["RAG Service<br/>Doc Parsing + Vector Search"]

    subgraph Instances["OpenClaw Instances"]
        OC1["Instance 1 (Docker)"]
        OC2["Instance 2 (Docker)"]
        OCN["Instance N (External)"]
    end

    DK["Docker Engine"]

    Client --> NextJS
    NextJS --> API
    API --> GW
    API --> PG
    API --> RD
    API -- "Docs/Search" --> RAG
    RAG --> PG
    GW --> Health
    GW -- "WebSocket" --> OC1
    GW -- "WebSocket" --> OC2
    GW -- "WebSocket" --> OCN
    API -. "Container Mgmt" .-> DK
    DK -. "Create/Control" .-> OC1
    DK -. "Create/Control" .-> OC2

    style Client fill:#e3f2fd
    style NextJS fill:#fff3e0
    style Backend fill:#e8f5e9
    style Storage fill:#fce4ec
    style RAG fill:#fff9c4
    style Instances fill:#f3e5f5
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Frontend | React 19, Tailwind CSS 4, shadcn/ui |
| State | Zustand 5, TanStack Query v5 |
| Database | PostgreSQL 17 + Prisma 7 (Driver Adapter) + pgvector |
| RAG | Python FastAPI + pgvector vector search |
| Cache | Redis 7 (ioredis) |
| Auth | RS256 JWT (jose) + bcryptjs |
| Gateway | WebSocket (ws) + Docker API (dockerode) |
| Validation | Zod 4 |

### Feature Overview

| Module | Routes | Key Capabilities |
|--------|--------|-----------------|
| Chat | 8 | Multi-conversation, streaming, thinking display, image attachments |
| Agents | 6 | CRUD, clone, classify, file management |
| Skills | 12 | ClawHub marketplace, install/publish, version management, IDE editor |
| Instances | 13 | Docker create, external gateway, health monitoring, config editor |
| Knowledge Base | 8 | Document upload, OCR, semantic search, streaming Q&A, scope management |
| Auth | 5 | JWT login, token rotation, rate limiting |
| Org | 5 | User/department CRUD, RBAC |
| Audit | 2 | Operation logs, CSV export |
| Dashboard | 1 | Instance/session/user/skill metrics |
| Other | 5 | Resource keys, instance access |

## Getting Started Guide

After deployment, follow these steps to start your first AI conversation:

### 1. Login

Visit `http://localhost:3100` and sign in with the default admin account:

- Email: `admin@teamclaw.local`
- Password: `Admin@123456`

> Recommended: Change the default password after first login.

### 2. Configure Model Resources (**Do this BEFORE creating instances**)

Go to the **Resources** page to create model resources. 25 built-in providers are supported, including region/plan variants (e.g. qwen's "CN Standard", "CN Coding Plan", "Intl Standard", "Intl Coding Plan"):

| Provider | API Protocol | Notes |
|----------|-------------|-------|
| Anthropic | `anthropic-messages` | Claude models, default provider |
| OpenAI | `openai-completions` | GPT / o series |
| Google | `google-generative-ai` | Gemini series |
| DeepSeek | `openai-completions` | DeepSeek V3 / R1 |
| Qwen | `openai-completions` | Includes Coding Plan variants |
| MiniMax / Doubao / Moonshot | mixed | Multiple region variants |
| Groq / xAI / Mistral | `openai-completions` | OpenAI-compatible |
| Ollama / vLLM | `ollama` / `openai-completions` | Local deployment |

> 25 providers supported (GLM, Qianfan, z.ai, Kimi Coding, etc.). See the Resources page for the full list.

**Workflow**:

1. **Create Resource** → pick a provider → if it has variants, pick one from the second-level dropdown → enter API key → save
2. Open the resource detail → **Model list** → click the ⭐ **star** next to one model to mark it as "default model for new instances"
3. Toggle **"Set as default"** on the resource card so this resource becomes the preferred key for its provider

**Why do this first?** Starting from v0.4.0, teamclaw **automatically** pushes your default resource + default model into every new instance on its first WebSocket connection:

```
Configure resources first (⭐ + "Set as default")
   ↓
Create an instance
   ↓
First WebSocket connect → teamclaw auto-injects models.providers + primary
   ↓
Works out of the box — no manual Config Editor setup needed
```

### 3. Deploy an OpenClaw Instance

Navigate to the **Instances** page and choose one of:

**Docker Container (Recommended)** — Click "Create Instance", select Docker mode, enter a name, choose an image (default: `alpine/openclaw:latest`), and create. Once online, it **automatically** uses the default resource + default model you marked in Step 2.

**External Gateway** — If you already have a running OpenClaw, select external gateway mode, enter the WebSocket URL and token to connect. Existing model configurations are not overwritten — use the Config Editor to switch models if needed.

Wait for instance status to become 🟢 **ONLINE** (typically 5-10 seconds).

### 4. Start Chatting

Navigate to the **Chat** page — once the instance is online, default agents appear in the left sidebar. Click an agent to start your conversation.

```
✅ Login → Configure Resources (⭐ default model) → Create Instance (auto-bound) → Start Chatting (~2 minutes)
```

### 5. Install Pre-packaged Skills (Optional)

v0.4.0 ships with 15 ready-to-use reference skills covering browser automation, content creation, data analysis, multi-search, and more:

| Category | Skills |
|---|---|
| Browser automation | `agent-browser`, `browserwing`, `playwright-scraper-skill` |
| Search | `baidu-search`, `multi-search-engine`, `vane-search` |
| Content creation | `anygen-skill`, `content-skills` (incl. baoyu markdown → WeChat / markdown → HTML) |
| Data analysis | `data-analyst` |
| Workflow helpers | `agent-init`, `multi-agent-cn`, `self-improving`, `skill-creator`, `summarize` |
| Business | `qcc-cli` (QCC enterprise lookup) |

**How to install**: Open **Skills** → pick a skill → click "Install to Instance" → choose target instance / agent / install path (workspace or global).

## Screenshots

<table>
  <tr>
    <td align="center"><img src="docs/screenshots/dashboard.png" width="400"><br><b>Dashboard</b></td>
    <td align="center"><img src="docs/screenshots/chat.png" width="400"><br><b>AI Chat</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/agents.png" width="400"><br><b>Agent Management</b></td>
    <td align="center"><img src="docs/screenshots/skills.png" width="400"><br><b>Skills Marketplace</b></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/screenshots/instances.png" width="400"><br><b>Instance Management</b></td>
    <td align="center"><img src="docs/screenshots/config-editor.png" width="400"><br><b>Config Editor</b></td>
  </tr>
</table>

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and PR guidelines.

## License

[MIT](LICENSE)

---
