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
- 实例自动发现 — 通过 OpenClaw 对话或 CLI 安装的 skill 自动同步到管理页面，无需手动导入
- 技能开发 — IDE 风格的文件编辑器，本地开发后发布到 ClawHub
- 版本管理 — 安装追踪、版本检查与一键升级
- 作用域控制 — PERSONAL / DEPARTMENT / GLOBAL 三级作用域，新增 INSTANCE 来源标签

**知识库 (RAG)**

- 文档上传 — 支持 PDF / DOCX / Excel（XLSX、XLS、XLSM），PaddleOCR 云端识别 + 按页/按行分块
- 混合检索 — Postgres FTS（jieba 中文分词）+ pgvector 向量 + **RRF 融合**，比纯向量召回更稳
- 多文档路由 — `rag.doc_profile` 摘要 + 关键词预筛候选文档，再在候选内做细检索
- **PDF 来源预览** — 对话回答里每条 PDF 引用可点击页码 → 右侧抽屉打开原 PDF 并跳到对应页
- 邻居扩展 — PDF 命中页自动带上下相邻页，Excel chunk 自动带相邻片段，避免上下文断裂
- Excel 字段化检索 — 表头自动识别 + 字段映射，可按"级别 / 发文字号 / 类型"等结构化过滤
- 作用域管理 — PERSONAL / DEPARTMENT / GLOBAL 三级知识库隔离
- 多租户存储 — 所有 RAG 数据存在 `rag` schema，每条 SQL 以 `kb_id` 为隔离轴

**工具箱**

- 统一入口 — 侧边栏「工具箱」聚合所有内置辅助工具，卡片式网格展示
- 可扩展 — 单文件 `TOOLS` 数组配置，新工具通过 `available: false` 标记"即将推出"
- **法规追踪** — 绑定知识库为追踪条目，自动提取关键词并通过博查 API 搜索法规/标准更新，发现新版本后写入待办清单。配套 OpenClaw skill 可一键运行检查流水线
- **舆情监控** — 聚合关键词、来源和风险信号的占位页，可接入搜索 / 社媒 / RSS 数据源

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

两种子模式可选——

**A. 全 Docker 一体化（推荐，零本地依赖）**

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
cp .env.example .env
node scripts/generate-keys.mjs            # 写入 JWT_*/ENCRYPTION_KEY 等

docker compose --profile app up -d        # 起 postgres + redis + rag + app
docker logs -f teamclaw-app               # 看 Next.js Turbopack 启动
```

访问 `http://localhost:3100`。改 `src/**` 自动热更新；改 `rag-service/app/**` 自动 reload。
`--profile app` 是开关：默认 `docker compose up -d` 只起基础三件套（postgres/redis/rag），方便习惯 host hot-reload 的人用 B 模式。

**B. 基础服务 Docker + Next.js 本地**

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
npm install

docker compose up -d                       # 起 postgres + redis + rag（不起 app）

cp .env.example .env
node scripts/generate-keys.mjs

npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

npm run dev                                # 本地跑 Next.js（端口 3100）
```

Host 上的 hot-reload 通常更快一点（< 0.5s），适合纯前端调试。两种模式 `data/knowledge-bases/` 是共享的，上传的文档不会因切换模式而丢失。

## 配置指南

复制 `.env.example` 为 `.env` 后，至少需要完成下面几类配置。`setup.sh` 会自动生成密钥；手动配置时请运行 `node scripts/generate-keys.mjs`。

### 基础服务

| 变量                                                  | 示例                                                                            | 说明                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `teamclaw` / `teamclaw_dev_2024` / `teamclaw`                                   | Docker Compose 创建 PostgreSQL 容器时使用                          |
| `DATABASE_URL`                                        | `postgresql://teamclaw:teamclaw_dev_2024@localhost:5432/teamclaw?schema=public` | Next.js 直连数据库；本地 host 模式使用 `localhost`                 |
| `REDIS_URL`                                           | `redis://localhost:6379`                                                        | Next.js 直连 Redis；Docker app 容器会自动改为 `redis://redis:6379` |
| `APP_PORT`                                            | `3100`                                                                          | Docker app 暴露的 Web 端口                                         |
| `NEXT_PUBLIC_APP_URL`                                 | 空或 `https://your-domain.com`                                                  | 留空会使用相对路径，反向代理和多域名访问更稳                       |

### 认证与加密

| 变量                                       | 生成方式                         | 说明                                             |
| ------------------------------------------ | -------------------------------- | ------------------------------------------------ |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`       | `node scripts/generate-keys.mjs` | RS256 JWT 私钥/公钥，Base64 编码                 |
| `ENCRYPTION_KEY`                           | `openssl rand -hex 32`           | AES-256-CBC 密钥，用来加密资源密钥和 RAG API Key |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | `15m` / `7d`                     | 登录 Token 有效期                                |

这些值首次上线后不要随意更换。更换 `ENCRYPTION_KEY` 会导致已保存的 API Key 无法解密。

### RAG 服务连接

| 变量                 | Docker app         | 本地 Next.js host 模式  | 说明                                                |
| -------------------- | ------------------ | ----------------------- | --------------------------------------------------- |
| `RAG_SERVICE_URL`    | `http://rag:8000`  | `http://localhost:8000` | Next.js 调用 Python RAG 服务的地址                  |
| `RAG_SERVICE_SECRET` | 自定义强随机字符串 | 同左                    | Next.js 和 RAG 服务之间的内部鉴权密钥，两边必须一致 |

Docker Compose 会在 `app` 容器内自动覆盖 `RAG_SERVICE_URL=http://rag:8000`。如果你用 `npm run dev` 在宿主机启动 Next.js，请在 `.env` 中保留 `RAG_SERVICE_URL=http://localhost:8000`。

### RAG 模型、Embedding 与 OCR

RAG 凭据有两种配置方式：

1. 推荐：登录后台，进入 **知识库** 页面，点击右上角 **RAG 配置**，填写 LLM、Embedding、Rerank、PaddleOCR。
2. 兜底：在 `.env` 中填写下面的变量。系统配置为空时会自动回退到环境变量。

| 变量                                 | 默认值                                               | 说明                                            |
| ------------------------------------ | ---------------------------------------------------- | ----------------------------------------------- |
| `LLM_API_KEY` 或 `DASHSCOPE_API_KEY` | 空                                                   | 文档摘要、章节摘要、最终回答使用的 LLM Key      |
| `LLM_BASE_URL`                       | `https://dashscope.aliyuncs.com/compatible-mode/v1`  | OpenAI 兼容接口地址                             |
| `LLM_MODEL`                          | `qwen3.5-35b-a3b`                                    | RAG 默认回答/摘要模型                           |
| `SILICONFLOW_API_KEY`                | 空                                                   | Embedding 和可选 rerank 的 API Key              |
| `SILICONFLOW_EMBEDDING_URL`          | `https://api.siliconflow.cn/v1/embeddings`           | Embedding endpoint；服务会自动归一化为 API root |
| `SILICONFLOW_EMBEDDING_MODEL`        | `BAAI/bge-m3`                                        | 默认向量模型                                    |
| `PGVECTOR_EMBED_DIM`                 | `1024`                                               | pgvector 维度，必须匹配 Embedding 输出维度      |
| `PADDLEOCR_TOKEN`                    | 空                                                   | PaddleOCR 云端识别 Token，PDF 入库需要          |
| `PADDLEOCR_MODEL`                    | `PP-OCRv5`                                           | OCR 模型                                        |
| `PADDLEOCR_JOB_URL`                  | `https://paddleocr.aistudio-app.com/api/v2/ocr/jobs` | PaddleOCR job API                               |

当前项目默认模型栈：

| 用途                     | 当前默认模型/服务         | 配置位置                                              | 说明                                                                     |
| ------------------------ | ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| RAG 回答、文档摘要       | `qwen3.5-35b-a3b`         | `rag.llm.model` / `LLM_MODEL`                         | 当前默认 LLM，默认通过 DashScope OpenAI 兼容接口调用                     |
| 查询改写、文档相关性判断 | 跟随 `rag.llm.model`      | `rag.llm.model` / `LLM_MODEL`                         | 正常由 Next.js 传入同一个 LLM；直连 RAG 服务且未传模型时回退 `qwen-plus` |
| PDF 页面图像回答         | 跟随 `rag.llm.model`      | `rag.llm.model` / `LLM_MODEL`                         | 如果你的 PDF 问答依赖页面截图，模型必须支持 `image_url` 多模态输入       |
| 向量检索                 | `BAAI/bge-m3`             | `rag.embedding.model` / `SILICONFLOW_EMBEDDING_MODEL` | 当前默认 Embedding，输出 1024 维向量                                     |
| 可选重排                 | `BAAI/bge-reranker-v2-m3` | `rag.rerank.model`                                    | 默认配置了模型名，但 `rag.rerank.enabled=false`，需要在后台手动开启      |
| OCR 入库                 | `PP-OCRv5`                | `rag.paddleocr.model` / `PADDLEOCR_MODEL`             | 当前 PDF 入库 OCR 模型；建议保持该模型                                   |

模型选择建议：

| 场景                       | 推荐配置                                                                  | 说明                                                                    |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 默认生产配置               | `qwen3.5-35b-a3b` + `BAAI/bge-m3` + `PP-OCRv5`                            | 保持当前默认，配置少、行为稳定，适合先上线验证                          |
| PDF 扫描件、截图型资料较多 | 使用支持视觉输入的 DashScope/OpenAI-compatible LLM，例如 `qwen-vl-max`    | RAG 会把命中 PDF 页面图像发给模型，纯文本模型可能无法回答               |
| 长文档或多文档召回噪声较高 | 开启 rerank，并使用 `BAAI/bge-reranker-v2-m3`                             | 先召回再重排，通常能减少无关片段进入最终回答                            |
| 成本优先、主要是文本/Excel | 可评估更轻量的 OpenAI-compatible 文本模型，但保留 `BAAI/bge-m3`           | 更换 LLM 不影响向量库；更换 Embedding 会影响向量维度和历史索引          |
| OCR 模型选择               | 固定使用 `PP-OCRv5`                                                       | 换成其他 OCR 模型可能改变文本切分、页码定位和表格识别，进而降低检索效果 |
| 更换 Embedding             | 新模型维度必须同步 `PGVECTOR_EMBED_DIM`，并重建或迁移 `rag` schema 向量表 | 当前 `BAAI/bge-m3` 是 1024 维，直接换维度会导致查询报错                 |

如果你更换 Embedding 模型且维度不是 1024，需要先清理或迁移 `rag` schema 中的向量表，再修改 `PGVECTOR_EMBED_DIM`，否则查询会出现维度不匹配。

### PDF 入库与回答预算

| 变量                                            | 默认值     | 说明                                 |
| ----------------------------------------------- | ---------- | ------------------------------------ |
| `INGEST_DEFAULT_WORKERS` / `INGEST_MAX_WORKERS` | `4` / `12` | OCR/入库并发上限                     |
| `PADDLEOCR_JOB_TIMEOUT`                         | `1800`     | 单个 OCR job 最大等待秒数            |
| `PADDLEOCR_CHUNK_PAGE_THRESHOLD`                | `48`       | 超过多少页时按块提交 OCR             |
| `PADDLEOCR_CHUNK_SIZE`                          | `40`       | 大 PDF 每个 OCR 分块页数             |
| `DOCUMENT_PROFILE_MAX_TOKENS`                   | `384`      | 文档路由摘要 token 预算              |
| `DOCUMENT_CHAPTER_SUMMARY_MAX_TOKENS`           | `4096`     | 章节/页段摘要 token 预算             |
| `UPLOAD_RENDER_DPI`                             | `110`      | PDF 入库时生成页面预览图的 DPI       |
| `LLM_RENDER_MAX_PIXELS`                         | `640000`   | 回答时发给视觉模型的页面图像最大像素 |
| `MULTI_DOC_TOTAL_PAGE_BUDGET`                   | `15`       | 多文档回答时总页面预算               |
| `MULTI_DOC_PER_DOC_PAGE_LIMIT`                  | `6`        | 多文档回答时单文档页面上限           |
| `MULTI_DOC_SINGLE_DOC_PAGE_LIMIT`               | `30`       | 单文档回答时页面上限                 |

### Docker 与 OpenClaw 实例

| 变量                     | macOS Docker Desktop     | Linux                               | 说明                                              |
| ------------------------ | ------------------------ | ----------------------------------- | ------------------------------------------------- |
| `DOCKER_SOCKET_PATH`     | `/var/run/docker.sock`   | `/var/run/docker.sock`              | TeamClaw 管理 OpenClaw 容器需要访问 Docker socket |
| `DOCKER_GID`             | `0`                      | `stat -c '%g' /var/run/docker.sock` | app 容器访问 Docker socket 的 group id            |
| `TEAMCLAW_DATA_DIR`      | `~/.teamclaw/instances`  | 自定义绝对路径                      | OpenClaw 实例数据挂载目录                         |
| `DEFAULT_OPENCLAW_IMAGE` | `alpine/openclaw:latest` | 同左                                | 新建实例默认镜像                                  |

## 配置校验

首次配置完成后建议按顺序执行：

```bash
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
docker compose up -d
curl http://localhost:8000/api/health
npm run dev
```

如果知识库上传失败，优先检查 `RAG_SERVICE_SECRET` 是否一致、`RAG_SERVICE_URL` 是否能从 Next.js 所在环境访问、`PADDLEOCR_TOKEN` 是否有效，以及 `SILICONFLOW_EMBEDDING_MODEL` 和 `PGVECTOR_EMBED_DIM` 是否匹配。

## 首次使用指南

部署完成后，按以下步骤开始你的第一次 AI 对话：

### 1. 登录管理面板

访问 `http://localhost:3100`，使用默认管理员账号登录：

- 邮箱：`admin@teamclaw.local`
- 密码：`Admin@123456`

> 建议首次登录后立即修改默认密码。

### 2. 配置模型资源（**建议先做，再创建实例**）

进入 **资源管理** 页面，创建模型资源。我们支持 25 个内置 Provider，包括多区域 / 多计划 variants（例如 qwen 的"国内 Standard"、"国内 Coding Plan"、"国际 Standard"、"国际 Coding Plan"）：

| 提供商                      | API 协议                        | 说明                    |
| --------------------------- | ------------------------------- | ----------------------- |
| Anthropic                   | `anthropic-messages`            | Claude 系列，默认提供商 |
| OpenAI                      | `openai-completions`            | GPT / o 系列            |
| Google                      | `google-generative-ai`          | Gemini 系列             |
| DeepSeek                    | `openai-completions`            | DeepSeek V3 / R1        |
| Qwen（通义千问）            | `openai-completions`            | 含 Coding Plan 变体     |
| MiniMax / Doubao / Moonshot | 多种                            | 含多 region 变体        |
| Groq / xAI / Mistral        | `openai-completions`            | OpenAI 兼容协议         |
| Ollama / vLLM               | `ollama` / `openai-completions` | 本地部署                |

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

| 类别         | Skills                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| 浏览器自动化 | `agent-browser`、`browserwing`、`playwright-scraper-skill`                     |
| 搜索         | `baidu-search`、`multi-search-engine`、`vane-search`                           |
| 内容创作     | `anygen-skill`、`content-skills`（含包鱼 Markdown→公众号 / Markdown→HTML）     |
| 数据分析     | `data-analyst`                                                                 |
| 工作流辅助   | `agent-init`、`multi-agent-cn`、`self-improving`、`skill-creator`、`summarize` |
| 商务         | `qcc-cli`（企查查）                                                            |

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

    RAG["RAG Service<br/>FTS + Vector + RRF 混合检索<br/>PaddleOCR + jieba 中文分词"]

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

| 层级     | 技术                                                                                        |
| -------- | ------------------------------------------------------------------------------------------- |
| 框架     | Next.js 16 (App Router, Turbopack)                                                          |
| 前端     | React 19, Tailwind CSS 4, shadcn/ui                                                         |
| 状态管理 | Zustand 5, TanStack Query v5                                                                |
| 数据库   | PostgreSQL 17 + Prisma 7 (Driver Adapter) + pgvector                                        |
| RAG      | Python FastAPI + asyncpg + pgvector + tsvector + jieba（混合检索，无 LlamaIndex/LangChain） |
| 缓存     | Redis 7 (ioredis)                                                                           |
| 认证     | RS256 JWT (jose) + bcryptjs                                                                 |
| 网关通信 | WebSocket (ws) + Docker API (dockerode)                                                     |
| 数据验证 | Zod 4                                                                                       |

### 功能概览

| 模块   | 路由数 | 核心能力                                                                                  |
| ------ | ------ | ----------------------------------------------------------------------------------------- |
| 对话   | 8      | 多会话、流式输出、思考展示、图片附件                                                      |
| Agent  | 6      | CRUD、克隆、分类、文件管理                                                                |
| Skills | 12     | ClawHub 市场、安装/发布、版本管理、IDE 编辑                                               |
| 实例   | 13     | Docker 创建、外部接入、健康监控、配置编辑                                                 |
| 知识库 | 10     | PDF/DOCX/Excel 上传、PaddleOCR、FTS+向量+RRF 混合检索、PDF 页面预览、多文档路由、流式问答 |
| 工具箱 | 3      | 卡片式工具集合、法规追踪、舆情监控等内置工具入口                                          |
| 认证   | 5      | JWT 登录、Token 轮转、限流                                                                |
| 组织   | 5      | 用户/部门 CRUD、RBAC 权限                                                                 |
| 审计   | 2      | 操作日志、CSV 导出                                                                        |
| 仪表盘 | 1      | 实例/会话/用户/技能统计                                                                   |
| 其他   | 5      | 资源密钥、实例访问                                                                        |

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
- Instance auto-discovery — skills installed via OpenClaw chat or CLI automatically sync to the management page
- Skill development — IDE-style file editor, develop locally and publish to ClawHub
- Version management — installation tracking, version checks, and one-click upgrades
- Scope control — PERSONAL / DEPARTMENT / GLOBAL skill scopes + INSTANCE source badge

**Knowledge Base (RAG)**

- Document upload — PDF / DOCX / Excel (XLSX, XLS, XLSM) with PaddleOCR cloud recognition and per-page / per-row chunking
- Hybrid retrieval — Postgres FTS (jieba CJK tokenization) + pgvector + **RRF fusion**; more robust recall than vector-only
- Multi-document routing — `rag.doc_profile` summaries + keywords pre-filter candidate docs, then fine-grained search runs within candidates
- **PDF source preview** — every PDF citation in chat answers is a clickable page chip → right-side drawer opens the original PDF and jumps to that page
- Neighbor expansion — PDF hits auto-include adjacent pages, Excel chunks auto-include neighbors, so context isn't cut mid-sentence
- Excel field-aware retrieval — header auto-detection + field mapping, supports structured filters like "level / document number / category"
- Scope management — PERSONAL / DEPARTMENT / GLOBAL knowledge base isolation
- Multi-tenant storage — all RAG data lives under the `rag` schema, every SQL query takes `kb_id` as the isolation axis

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

Two sub-modes —

**A. Full Docker stack (recommended, zero local deps)**

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
cp .env.example .env
node scripts/generate-keys.mjs            # writes JWT_*/ENCRYPTION_KEY etc.

docker compose --profile app up -d        # starts postgres + redis + rag + app
docker logs -f teamclaw-app               # watch Next.js Turbopack boot
```

Visit `http://localhost:3100`. Edits to `src/**` hot-reload; edits to `rag-service/app/**` trigger uvicorn `--reload`.
`--profile app` is a switch: plain `docker compose up -d` only brings up the three infra services (postgres/redis/rag), letting host-mode users continue with B below.

**B. Infra in Docker, Next.js on host**

```bash
git clone https://github.com/szsip239/teamclaw.git
cd teamclaw
npm install

docker compose up -d                       # postgres + redis + rag (no app)

cp .env.example .env
node scripts/generate-keys.mjs

npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts

npm run dev                                # Next.js on host (port 3100)
```

Host-side hot-reload is usually a touch faster (< 0.5s) — handy for pure frontend tweaks. `data/knowledge-bases/` is shared between both modes, so uploaded docs survive a mode switch.

## Configuration Guide

Copy `.env.example` to `.env`, then fill in the required values. `setup.sh` generates secrets automatically; if you configure the project manually, run `node scripts/generate-keys.mjs`.

### Core Services

| Variable                                              | Example                                                                         | Notes                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `teamclaw` / `teamclaw_dev_2024` / `teamclaw`                                   | Used by Docker Compose when creating PostgreSQL                       |
| `DATABASE_URL`                                        | `postgresql://teamclaw:teamclaw_dev_2024@localhost:5432/teamclaw?schema=public` | Database URL for host-mode Next.js                                    |
| `REDIS_URL`                                           | `redis://localhost:6379`                                                        | Redis URL for host-mode Next.js; Docker app uses `redis://redis:6379` |
| `APP_PORT`                                            | `3100`                                                                          | Web port exposed by the Docker app service                            |
| `NEXT_PUBLIC_APP_URL`                                 | empty or `https://your-domain.com`                                              | Empty means relative URLs, which works better behind reverse proxies  |

### Auth And Encryption

| Variable                                   | How to generate                  | Notes                                                            |
| ------------------------------------------ | -------------------------------- | ---------------------------------------------------------------- |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`       | `node scripts/generate-keys.mjs` | Base64-encoded RS256 private/public keys                         |
| `ENCRYPTION_KEY`                           | `openssl rand -hex 32`           | AES-256-CBC key for stored provider credentials and RAG API keys |
| `JWT_ACCESS_EXPIRY` / `JWT_REFRESH_EXPIRY` | `15m` / `7d`                     | Login token lifetimes                                            |

Do not rotate these casually after first deployment. Rotating `ENCRYPTION_KEY` makes existing saved API keys unreadable.

### RAG Service Connection

| Variable             | Docker app           | Host-mode Next.js       | Notes                                                                    |
| -------------------- | -------------------- | ----------------------- | ------------------------------------------------------------------------ |
| `RAG_SERVICE_URL`    | `http://rag:8000`    | `http://localhost:8000` | Python RAG service endpoint used by Next.js                              |
| `RAG_SERVICE_SECRET` | strong random string | same value              | Internal shared secret between Next.js and RAG; both services must match |

Docker Compose overrides `RAG_SERVICE_URL=http://rag:8000` inside the `app` container. If you run Next.js with `npm run dev` on the host, keep `RAG_SERVICE_URL=http://localhost:8000` in `.env`.

### RAG LLM, Embedding, And OCR

RAG credentials can be configured in two ways:

1. Recommended: sign in as an admin, open **Knowledge Bases**, click **RAG Config**, then fill in LLM, Embedding, Rerank, and PaddleOCR settings.
2. Fallback: set the following `.env` variables. If UI settings are empty, TeamClaw falls back to env values.

| Variable                             | Default                                              | Notes                                                                     |
| ------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `LLM_API_KEY` or `DASHSCOPE_API_KEY` | empty                                                | API key used for document summaries and final answers                     |
| `LLM_BASE_URL`                       | `https://dashscope.aliyuncs.com/compatible-mode/v1`  | OpenAI-compatible API base URL                                            |
| `LLM_MODEL`                          | `qwen3.5-35b-a3b`                                    | Default RAG answer/summary model                                          |
| `SILICONFLOW_API_KEY`                | empty                                                | API key for embedding and optional rerank                                 |
| `SILICONFLOW_EMBEDDING_URL`          | `https://api.siliconflow.cn/v1/embeddings`           | Embedding endpoint; the service normalizes it to the API root when needed |
| `SILICONFLOW_EMBEDDING_MODEL`        | `BAAI/bge-m3`                                        | Default embedding model                                                   |
| `PGVECTOR_EMBED_DIM`                 | `1024`                                               | pgvector dimension; must match embedding output                           |
| `PADDLEOCR_TOKEN`                    | empty                                                | PaddleOCR cloud token, required for PDF ingestion                         |
| `PADDLEOCR_MODEL`                    | `PP-OCRv5`                                           | OCR model                                                                 |
| `PADDLEOCR_JOB_URL`                  | `https://paddleocr.aistudio-app.com/api/v2/ocr/jobs` | PaddleOCR job API                                                         |

Current default model stack:

| Purpose                              | Current default model/service | Config key                                            | Notes                                                                                             |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| RAG answers and document summaries   | `qwen3.5-35b-a3b`             | `rag.llm.model` / `LLM_MODEL`                         | Current default LLM, called through DashScope's OpenAI-compatible endpoint                        |
| Query rewrite and document filtering | Follows `rag.llm.model`       | `rag.llm.model` / `LLM_MODEL`                         | Next.js normally passes the same LLM; direct RAG calls without a model fall back to `qwen-plus`   |
| PDF page-image answering             | Follows `rag.llm.model`       | `rag.llm.model` / `LLM_MODEL`                         | If PDF Q&A depends on rendered page images, the model must support multimodal `image_url` input   |
| Vector retrieval                     | `BAAI/bge-m3`                 | `rag.embedding.model` / `SILICONFLOW_EMBEDDING_MODEL` | Current default embedding model; outputs 1024-dimensional vectors                                 |
| Optional reranking                   | `BAAI/bge-reranker-v2-m3`     | `rag.rerank.model`                                    | The default model name is seeded, but `rag.rerank.enabled=false`; enable it in the admin UI first |
| OCR ingestion                        | `PP-OCRv5`                    | `rag.paddleocr.model` / `PADDLEOCR_MODEL`             | Current PDF ingestion OCR model; recommended to keep unchanged                                    |

Model recommendations:

| Scenario                             | Recommended setup                                                            | Notes                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Default production setup             | `qwen3.5-35b-a3b` + `BAAI/bge-m3` + `PP-OCRv5`                               | Keep the current defaults for the first deployment; it has the fewest moving parts                                 |
| Many scanned PDFs or screenshot docs | Use a vision-capable DashScope/OpenAI-compatible LLM, such as `qwen-vl-max`  | RAG sends matched PDF page images to the model; text-only models may not answer correctly                          |
| Noisy long-document retrieval        | Enable rerank and use `BAAI/bge-reranker-v2-m3`                              | Recall first, rerank second, then send cleaner context to the final answer model                                   |
| Cost-first text/Excel workloads      | Evaluate a lighter OpenAI-compatible text model, while keeping `BAAI/bge-m3` | Changing the LLM does not invalidate vectors; changing embedding models invalidates existing vector indexes        |
| OCR model choice                     | Keep `PP-OCRv5`                                                              | Other OCR models may change text segmentation, page positioning, and table recognition, reducing retrieval quality |
| Replacing embedding                  | Match `PGVECTOR_EMBED_DIM` and rebuild or migrate vector tables under `rag`  | Current `BAAI/bge-m3` vectors are 1024-dimensional                                                                 |

If you change the embedding model and its dimension is not 1024, clean or migrate the vector tables under the `rag` schema before changing `PGVECTOR_EMBED_DIM`.

### PDF Ingestion And Answer Budgets

| Variable                                        | Default    | Notes                                              |
| ----------------------------------------------- | ---------- | -------------------------------------------------- |
| `INGEST_DEFAULT_WORKERS` / `INGEST_MAX_WORKERS` | `4` / `12` | OCR/ingestion concurrency limits                   |
| `PADDLEOCR_JOB_TIMEOUT`                         | `1800`     | Max seconds to wait for one OCR job                |
| `PADDLEOCR_CHUNK_PAGE_THRESHOLD`                | `48`       | Split OCR jobs when a PDF is larger than this      |
| `PADDLEOCR_CHUNK_SIZE`                          | `40`       | Pages per OCR chunk for large PDFs                 |
| `DOCUMENT_PROFILE_MAX_TOKENS`                   | `384`      | Document-routing summary budget                    |
| `DOCUMENT_CHAPTER_SUMMARY_MAX_TOKENS`           | `4096`     | Chapter/page-range summary budget                  |
| `UPLOAD_RENDER_DPI`                             | `110`      | DPI used when rendering stored page previews       |
| `LLM_RENDER_MAX_PIXELS`                         | `640000`   | Max pixels sent to the vision model per page image |
| `MULTI_DOC_TOTAL_PAGE_BUDGET`                   | `15`       | Total page budget for multi-document answers       |
| `MULTI_DOC_PER_DOC_PAGE_LIMIT`                  | `6`        | Per-document page cap for multi-document answers   |
| `MULTI_DOC_SINGLE_DOC_PAGE_LIMIT`               | `30`       | Page cap for single-document answers               |

### Docker And OpenClaw Instances

| Variable                 | macOS Docker Desktop     | Linux                               | Notes                                                             |
| ------------------------ | ------------------------ | ----------------------------------- | ----------------------------------------------------------------- |
| `DOCKER_SOCKET_PATH`     | `/var/run/docker.sock`   | `/var/run/docker.sock`              | TeamClaw needs Docker socket access to manage OpenClaw containers |
| `DOCKER_GID`             | `0`                      | `stat -c '%g' /var/run/docker.sock` | Group id used by the app container for Docker socket access       |
| `TEAMCLAW_DATA_DIR`      | `~/.teamclaw/instances`  | absolute host path                  | Host directory for OpenClaw instance data                         |
| `DEFAULT_OPENCLAW_IMAGE` | `alpine/openclaw:latest` | same                                | Default image for new instances                                   |

## Configuration Check

After first-time setup, run:

```bash
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
docker compose up -d
curl http://localhost:8000/api/health
npm run dev
```

If knowledge-base uploads fail, check that `RAG_SERVICE_SECRET` matches in both services, `RAG_SERVICE_URL` is reachable from the Next.js runtime, `PADDLEOCR_TOKEN` is valid, and `SILICONFLOW_EMBEDDING_MODEL` matches `PGVECTOR_EMBED_DIM`.

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

    RAG["RAG Service<br/>FTS + Vector + RRF Hybrid<br/>PaddleOCR + jieba CJK tokenization"]

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

| Layer      | Technology                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Framework  | Next.js 16 (App Router, Turbopack)                                                                 |
| Frontend   | React 19, Tailwind CSS 4, shadcn/ui                                                                |
| State      | Zustand 5, TanStack Query v5                                                                       |
| Database   | PostgreSQL 17 + Prisma 7 (Driver Adapter) + pgvector                                               |
| RAG        | Python FastAPI + asyncpg + pgvector + tsvector + jieba (hybrid retrieval, no LlamaIndex/LangChain) |
| Cache      | Redis 7 (ioredis)                                                                                  |
| Auth       | RS256 JWT (jose) + bcryptjs                                                                        |
| Gateway    | WebSocket (ws) + Docker API (dockerode)                                                            |
| Validation | Zod 4                                                                                              |

### Feature Overview

| Module         | Routes | Key Capabilities                                                                                                      |
| -------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Chat           | 8      | Multi-conversation, streaming, thinking display, image attachments                                                    |
| Agents         | 6      | CRUD, clone, classify, file management                                                                                |
| Skills         | 12     | ClawHub marketplace, install/publish, version management, IDE editor                                                  |
| Instances      | 13     | Docker create, external gateway, health monitoring, config editor                                                     |
| Knowledge Base | 10     | PDF/DOCX/Excel upload, PaddleOCR, FTS+vector+RRF hybrid retrieval, PDF page preview, multi-doc routing, streaming Q&A |
| Auth           | 5      | JWT login, token rotation, rate limiting                                                                              |
| Org            | 5      | User/department CRUD, RBAC                                                                                            |
| Audit          | 2      | Operation logs, CSV export                                                                                            |
| Toolbox        | 3      | Card-style tool collection, regulation tracker, public opinion, and more built-in utilities                           |
| Dashboard      | 1      | Instance/session/user/skill metrics                                                                                   |
| Other          | 5      | Resource keys, instance access                                                                                        |

## Getting Started Guide

After deployment, follow these steps to start your first AI conversation:

### 1. Login

Visit `http://localhost:3100` and sign in with the default admin account:

- Email: `admin@teamclaw.local`
- Password: `Admin@123456`

> Recommended: Change the default password after first login.

### 2. Configure Model Resources (**Do this BEFORE creating instances**)

Go to the **Resources** page to create model resources. 25 built-in providers are supported, including region/plan variants (e.g. qwen's "CN Standard", "CN Coding Plan", "Intl Standard", "Intl Coding Plan"):

| Provider                    | API Protocol                    | Notes                           |
| --------------------------- | ------------------------------- | ------------------------------- |
| Anthropic                   | `anthropic-messages`            | Claude models, default provider |
| OpenAI                      | `openai-completions`            | GPT / o series                  |
| Google                      | `google-generative-ai`          | Gemini series                   |
| DeepSeek                    | `openai-completions`            | DeepSeek V3 / R1                |
| Qwen                        | `openai-completions`            | Includes Coding Plan variants   |
| MiniMax / Doubao / Moonshot | mixed                           | Multiple region variants        |
| Groq / xAI / Mistral        | `openai-completions`            | OpenAI-compatible               |
| Ollama / vLLM               | `ollama` / `openai-completions` | Local deployment                |

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

| Category           | Skills                                                                             |
| ------------------ | ---------------------------------------------------------------------------------- |
| Browser automation | `agent-browser`, `browserwing`, `playwright-scraper-skill`                         |
| Search             | `baidu-search`, `multi-search-engine`, `vane-search`                               |
| Content creation   | `anygen-skill`, `content-skills` (incl. baoyu markdown → WeChat / markdown → HTML) |
| Data analysis      | `data-analyst`                                                                     |
| Workflow helpers   | `agent-init`, `multi-agent-cn`, `self-improving`, `skill-creator`, `summarize`     |
| Business           | `qcc-cli` (QCC enterprise lookup)                                                  |

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
