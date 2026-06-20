# Changelog

All notable changes since `v0.3.0` (2026-03-30).

---

## v0.6.2 (2026-06-21)

> Patch release: removes reusable demo credentials from the published setup path and makes fresh deployments generate their own database, RAG, and initial admin secrets.

### Security Hardening

- `setup.sh` now generates `POSTGRES_PASSWORD`, `DATABASE_URL`, `RAG_SERVICE_SECRET`, and `INITIAL_ADMIN_PASSWORD` when `.env` is missing, blank, or still contains placeholders.
- `scripts/generate-keys.mjs --write` now fills first-run database/RAG/admin secrets in addition to JWT and encryption keys.
- `prisma/seed.ts` no longer ships a fixed admin password; it uses `INITIAL_ADMIN_PASSWORD` for first creation or generates and prints a one-time password.
- Docker Compose files now require generated database and RAG secrets instead of falling back to reusable public defaults.
- Published docs no longer advertise a shared admin password or host-specific local paths.
- The default OpenClaw image is pinned to `alpine/openclaw:2026.6.6-browser` for repeatable new deployments.

### Upgrade Notes

- Existing deployments are not rotated automatically. If an environment still uses pre-v0.6.2 public defaults, rotate them manually during a planned maintenance window.
- Re-running `setup.sh` preserves existing non-placeholder secrets to avoid breaking existing databases.

---

## v0.6.1 (2026-06-21)

> Patch release: hardens first-run deployment docs and setup scripts so new users can start without secret rotation or key-generation ordering issues.

### Fixed

- `setup.sh` now preserves existing JWT and encryption secrets on rerun; it only generates values when `.env` is missing, blank, or still contains placeholders.
- `setup.sh` now auto-detects `DOCKER_GID` on Linux when possible, reducing Docker socket permission issues for managed runtime containers.
- `scripts/generate-keys.mjs --write` now writes missing `.env` placeholders directly, uses only Node built-ins, preserves existing secrets by default, and updates JWT private/public keys as a pair.
- README deployment guidance is shorter and focused on first successful startup: production setup, local dev setup, first-use checklist, required config, and common startup failures.
- `.env.example` comments now point to the current setup scripts and the 6.6 browser runtime image.

---

## v0.6.0 (2026-06-21)

> 正式发布：多 runtime Chat、Pi Agent Runtime、OpenClaw 6.6/v4 协议适配、产物归一化、模型资源同步、RAG/法规/工具箱和生产部署稳定性集中升级。

### Highlights

- **Enterprise positioning refresh**: TeamClaw is now positioned as an enterprise AI Agent operations platform for multi-instance, multi-tenant, multi-agent, multi-runtime deployments.
- **Multi-runtime Chat**: OpenClaw-compatible runtime and Pi runtime can be switched from the chat composer, with normal/fast naming, runtime icons, current model display, and background run status.
- **Pi Agent Runtime**: Added `pi-wrapper`, runtime gateway mapping, Pi session storage, secured gateway access, chart/file artifact handling, and model config sync.
- **OpenClaw 6.6 / protocol v4**: Upgraded gateway negotiation to v4, refactored chat streaming, staged replies, tool calls, hidden thinking, and stop/error handling.
- **Artifact output reliability**: Generated files are normalized into canonical session output, duplicate names are auto-numbered, and deterministic download links are rendered in chat history and live streams.
- **Chat history and queue consistency**: Shared message normalization and artifact finalization across send, history, and queue paths; fixed cross-runtime ordering, duplicate merges, and archived-session ordering.
- **Model/resource operations**: Added provider variant normalization, Agent Plan endpoint fixes, model push to OpenClaw/Pi, provider sync, current model display, and selectable `low / medium / xhigh` thinking levels.
- **Agent workspace UX**: Added long-press rename, running indicators, unread/error badges, and background completion reconciliation when switching agents.
- **RAG and business tools**: Improved FTS + pgvector + RRF retrieval, PDF page preview, Excel field-aware retrieval, regulation tracking, and toolbox navigation.
- **Deployment/build hardening**: Added Pi wrapper orchestration, production init via `prisma migrate deploy`, larger Nginx upload body support, Next proxy migration, and clean Turbopack build tracing.

### Upgrade Notes

- Existing OpenClaw managed instances should run OpenClaw 6.6+ with gateway protocol v4.
- Pi runtime deployments require the bundled `pi-wrapper` service to be available in the managed container setup.
- Production deployments should run migrations with `prisma migrate deploy`.
- If model resources are pushed to both OpenClaw and Pi, choose a thinking level at push time; provider-specific mapping is handled by the target runtime/provider layer.

---

## v0.5.2 (2026-05-25)

> 分支 `codex/teamclaw-kb-rag-skills-updates` — 法规追踪、Skill 同步、认证增强。

### 🎯 Highlights

- **法规追踪**: 新增「工具箱 → 法规追踪」模块，用户可将知识库绑定为追踪条目，定时检查法规/标准更新。配套 `regulation-tracker` skill 可在 OpenClaw 中一键运行检查流水线。
- **Skill 实例自动发现**: 在 OpenClaw 对话中通过 ClawHub 安装的 skill 会自动出现在 TeamClaw Skills 管理页面，无需手动导入。新增 `INSTANCE` 来源标签。
- **Bearer Token 认证**: 中间件支持 `Authorization: Bearer <JWT>` 请求头，API 路由可通过 JWT 直接鉴权，不再仅依赖 cookie。
- **博查搜索接入**: 法规追踪的检查流水线支持通过博查 API 进行真实法规搜索（需配置 `BOCHA_API_KEY`）。

---

### ✨ New Features

**法规追踪 (Regulation Tracker)**

- 新增页面 `src/app/(dashboard)/regulations/`：追踪条目列表 + 创建/删除/详情页
- 新增 API `src/app/api/v1/regulations/`：CRUD 追踪条目、一键检查、待办更新管理
- 新增内部 API `src/app/api/v1/internal/regulations/check/`：供 skill/cron 调用，支持服务令牌 + 用户邮箱认证
- 新增 `RegulationTracker` + `PendingUpdate` 数据模型（Prisma schema + migration）
- 新增 hooks (`use-regulations.ts`)、types (`regulation.ts`)、validation (`regulation.ts`)
- 新增 `/data/skills/regulation-tracker/` — OpenClaw skill：`check.py` 调用 TeamClaw API 执行检查
- 工具箱新增「法规追踪」工具卡（ScrollText icon → `/regulations`）
- 搜索提供者可插拔：`MockSearchProvider`（演示）→ `BochaSearchProvider`（生产）
- i18n：中英文全覆盖（`regulations.*` 键族）

**Skill 实例同步**

- Skills API (`GET /api/v1/skills`) 自动扫描已连接实例的 workspace，发现未注册 skill 后自动创建 DB 记录（source=`INSTANCE`）
- `SkillSourceBadge` 新增 INSTANCE 标签（绿色 HardDrive icon）
- Skills 页面筛选下拉新增「实例」选项
- Skill 文件 API（列表/读写/删）对 INSTANCE 类型自动定位实例 workspace 路径
- 新增 `resolveSkillDir()`、`findInstanceSkillDir()` — 跨 `data/skills/` 和实例 workspace 的目录解析
- i18n：`skill.sourceInstance`（实例/Instance）

**Bearer Token 认证**

- `src/middleware.ts`：`extractToken()` 优先读 cookie，其次读 `Authorization: Bearer` header
- 所有 API 路由自动支持 Bearer JWT（无需额外改动，中间件注入 `x-user-id` 等请求头）
- `/api/v1/internal/` 加入 `PUBLIC_PATHS`（内部端点走自有鉴权，不走 JWT 中间件）

---

### 🔧 Internal Changes

**Skill 删除增强**

- DELETE skill 前遍历所有 `SkillInstallation`，清理实例上的实际文件目录
- 新增 `cleanupInstalledFiles()` — 对外部实例用 `fs.rm()`，Docker 实例用 `dockerManager.removeContainerDir()`
- 清理是 best-effort（`Promise.allSettled`），单实例失败不阻塞删除

**安装时环境变量提示**

- install API 解析 SKILL.md frontmatter 的 `metadata.requires.env`
- 响应中返回 `requiredEnvVars` + `primaryEnvVar`，前端弹 warning toast 提示用户配置
- i18n：`skill.envVarsRequired`（中英文）

**依赖变更**

- `prisma/schema.prisma`：`SkillSource` 枚举新增 `INSTANCE`
- `RegulationTracker` + `PendingUpdate` + `PendingStatus` 模型
- `.env`：新增 `REGULATION_SKILL_TOKEN`、`REGULATION_SEARCH_PROVIDER`、`BOCHA_API_KEY`

---

### 🐛 Bug Fixes

- **Skill 删除只删一半**：DELETE 仅清 DB + `data/skills/`，不清实例 workspace → 现遍历 installation 同步清理
- **内部 API 被中间件拦截**：`/api/v1/internal/` 不在白名单 → 加入 `PUBLIC_PATHS`
- **INSTANCE skill 详情页空白**：文件 API 硬编码读 `data/skills/` → 现对 INSTANCE skill 查实例 workspace

---

### 📋 Commits

- `a80a6ad` docs: README + CHANGELOG v0.5.1 covering branch deltas vs main
- Multiple uncommitted changes on `codex/teamclaw-kb-rag-skills-updates`

---

## v0.5.1 (2026-05-22)

> 分支 `codex/teamclaw-kb-rag-skills-updates` vs `main` 的全部增量。

### 🎯 Highlights

- **PDF.js 资源去仓库化**: 把 ~36MB 的 `pdfjs-dist` build / cmaps / standard_fonts 从 git 仓库剥离，改用 npm 依赖 + `scripts/sync-pdfjs.mjs` 在 `postinstall` / `prebuild` / `dev` 三处自动同步。仓库瘦身 ~75 000 行，升级 PDF.js 只需 bump `package.json` 版本号。
- **聊天 ↔ 知识库 解耦**: 聊天侧不再挂载知识库、不再做 RAG 上下文注入。RAG 问答完全由「知识库 → 问答」页面承担，简化心智模型，避免两条 RAG 入口的状态分裂。
- **侧边栏新增「工具箱」**: 原「舆情监控」侧边栏直链升级为可扩展的「工具箱」(`/tools`)，单卡片网格承载多个未来内置工具，「舆情监控」作为首个工具卡保留并指向原 `/public-opinion` 页面。

---

### ✨ New Features

**工具箱**

- 新增页面 `src/app/(dashboard)/tools/page.tsx`：响应式卡片网格，支持 `available: false` 的「即将推出」标记，便于后续按需追加工具
- 新增 nav 入口 `工具箱 / Toolbox`（Wrench 图标 → `/tools`），替换原 `舆情监控 / Public Opinion` 侧边栏直链
- 「舆情监控」改为工具箱内首个卡片，点击跳转到现有 `/public-opinion` 占位页（页面本身未改动）
- 新增 i18n 键（中英双语）：`nav.toolbox`、`page.toolbox` / `page.toolboxDesc`、`toolbox.openTool` / `toolbox.comingSoon` / `toolbox.empty` / `toolbox.publicOpinion.title|desc`
- `src/lib/dashboard-title.ts` 注册 `/tools → page.toolbox`，导航条标题随路由切换

**PDF.js 同步脚本**

- 新增 `scripts/sync-pdfjs.mjs`：从 `node_modules/pdfjs-dist` 拷贝 `build/`（pdf.mjs、pdf.worker.mjs 及对应 source map）、`cmaps/`、`standard_fonts/` 到 `public/pdfjs/`，幂等 `rm -rf` + `cp`
- `package.json` 把同步挂到三处生命周期：
  - `postinstall` — `npm install` 后自动同步
  - `prebuild` — `npm run build` 前自动同步
  - `dev` — `npm run dev` 启动前先同步（防本地切分支后 PDF 预览空白）
- 新增 `npm run sync:pdfjs` 别名供手动触发
- `.gitignore` 忽略 `public/pdfjs/build/`、`public/pdfjs/web/cmaps/`、`public/pdfjs/web/standard_fonts/`
- 仓库内仅保留 npm 包不含的 generic viewer（`viewer.html` / `viewer.mjs` / `viewer.css` / `locale/` / `images/` / `debugger.*`）

---

### 🔧 Internal Changes

**聊天侧 RAG 路径整体下线**

- 移除组件：`src/components/chat/chat-kb-selector.tsx`、`src/components/knowledge-bases/kb-qa-sources.tsx`
- 移除库：`src/lib/knowledge-base/rag-query-context.ts`（RAG 上下文注入逻辑）
- 移除路由：`/api/v1/chat/sessions/[id]/knowledge-bases`
- chat-store 去掉 `mountedKbIds` 状态、`pdfPreview` 状态及配套 actions
- send route (`src/app/api/v1/chat/send/route.ts`) 移除 KB 上下文注入分支，`message` 不再经 `queryKBsForContext` 改写，直接进 gateway
- chat-input 视觉重做：所有控件（📎 附件、📁 移动文件面板、Textarea、Send/Stop）合并进单个 pill 风格圆角容器
- chat-header 移除 `mountedKbIds` Badge 展示
- chat session 验证 schema 移除 `kbIds` 字段

**知识库内问答增强**

- `src/components/knowledge-bases/kb-qa-tab.tsx` 大幅重写 (+190/-... 行)，原 `kb-qa-sources.tsx` 的来源面板逻辑内联进 QA 视图，配合 `page-citations` 提供「第 N 页」可点击 chip
- 走 `/api/v1/knowledge-bases/[id]/documents/[docId]/file` 拉原文 PDF，复用同一套 pdf.js viewer iframe

**依赖与脚手架**

- 新增 dependency：`pdfjs-dist@4.4.168`（生产依赖，运行时由 `sync-pdfjs.mjs` 在构建期拷到 public）
- `prisma/schema.prisma` 微调 1 行
- 路径不安全的删除：`public/pdfjs/build/`、`public/pdfjs/web/cmaps/`、`public/pdfjs/web/standard_fonts/`（共 ~200 个二进制 / 大文件）

---

### 🐛 Bug Fixes / 已知坑

- 旧本地仓库切到本分支、且没跑过 `npm install`（或跑了 `--ignore-scripts`）时，会出现「文档预览空白、`第 N 页` chip 点击无反应」。原因：viewer.html 加载，但内部 `import '../build/pdf.mjs'` 404。
  - 修复一句话：`npm install` 或 `npm run sync:pdfjs`。
  - 长期保险：本版本已把 `dev` 脚本前置 `sync:pdfjs`，下次 `npm run dev` 时会自动补齐。

---

### 📋 Commits

- `f8a6238` Streamline PDF.js assets and KB chat flow
- `5e7636b` feat: replace public-opinion sidebar entry with toolbox

---

## v0.5.0 (2026-05-18)

### 🎯 Highlights

- **RAG 引擎完全重写**: 弃用 LlamaIndex，改为 **Postgres-native 混合检索**（FTS via tsvector + dense via pgvector + RRF 融合）。算法栈源自 [llm-rag](https://github.com/biyiyizuilihai/llm-rag) 的工程实践，适配 TeamClaw 的多租户 / RBAC / 凭据透传体系。
- **PDF 来源页面预览**: 对话回答里 PDF 引用旁出现可点击的「第 N 页」chip，点击右侧抽屉打开原始 PDF 并自动跳转到对应页（浏览器原生 PDF 查看器，`#page=N` 锚点跳转）。
- **Excel 字段化检索（后端就绪）**: 新增 `/api/excel/preview` + `/api/excel/config` 两个端点，自动识别表头并按"标题 / 正文 / 过滤字段 / 来源字段"做字段化分块。前端 UI 下一期接入。
- **Docker 全栈一体化**: `docker compose --profile app up -d` 一键起 postgres + redis + rag + Next.js 四个容器，host 端不需要 `npm run dev`。原 host 模式（基础设施 docker + Next.js 本地）保留为可选。
- **RAG 镜像瘦身 82%**: 从 6.31GB → 1.12GB（去掉 llama-index-\* / dashscope / psycopg2 等约 1.2GB 依赖）。

---

### ✨ New Features

**RAG 算法栈**

- **混合检索** (`rag-service/app/retrieval.py`): FTS + 向量并行查询 → RRF (Reciprocal Rank Fusion) 合并 → 邻居扩展 → 组 context
- **多文档路由**: 新增 `rag.doc_profile` 表（每文档 60-120 字 LLM 摘要 + 关键词），retrieval 先按 KB 维度路由出 top-N 候选文档，再在候选内做细粒度页 / 行检索
- **中文 FTS**: Python 端 jieba 分词 → 写入 `*_tokens` 列 → Postgres 生成 `tsvector('simple', tokens)` 列，查询时 jieba 切句再拼 tsquery。无需 zhparser / pg_jieba 扩展
- **PDF 页级索引** (`rag-service/app/pdf_pipeline.py`): PaddleOCR JSONL 按页解析（不再 `\n\n` 拼大字符串），每页独立 chunk 携带 `display_page` metadata；长页二次切分用 `page_index*1000+i` 编码子索引
- **Excel 政策化分块** (`rag-service/app/excel_pipeline.py`): 表头自动检测、`row_as_document` 模式、按字段聚合 metadata、固定重叠切分，与 [llm-rag](https://github.com/biyiyizuilihai/llm-rag) 行为对齐
- **HNSW 向量索引 + GIN FTS 索引**: 自动在 schema bootstrap 时创建，开箱即用

**PDF 来源预览**

- 新增组件 `src/components/chat/pdf-preview-drawer.tsx`：右侧抽屉用 `<iframe>` 装浏览器原生 PDF 查看器，`#page=N&view=FitH` 跳页 + 全宽自适应
- 新增端点 `/api/v1/knowledge-bases/[id]/documents/[docId]/file`：代理 RAG service 的 `source.pdf` artifact，权限走 KB 可见性校验，`Content-Type: application/pdf` + inline
- `KbSourceRef` 扩字段：`docRowId / docName / pageIndex / sourceType`
- `rag-query-context.ts` 把 RAG 返回的 `metadata.doc_id / page_index` 透传，并查 Prisma `KnowledgeDocument` 拿文件名（RAG 的 `doc_id` ↔ Prisma 的 `docId` 映射）
- chat-store 新增 `pdfPreview` 状态 + `openPdfPreview` / `closePdfPreview` actions
- chat 消息底部"来源"区里 PDF chunks 多了 `📄 文件名` 和可点击 `第 N 页` chip

**Excel 字段化 API（后端）**

- `POST /api/excel/preview` → 返回 columns + sample_rows + `guessed_config`（自动猜 title/content/filter/source 字段）
- `POST /api/excel/config` → 校验配置后触发 ingestion，写 `rag.excel_config` / `rag.excel_policy` / `rag.excel_policy_chunk`
- 支持 `.xlsx / .xls / .xlsm`，xlrd + openpyxl 双引擎
- 默认 ingest 通过 `/api/ingest` 按文件后缀自动分流（PDF / DOCX / Excel），向后兼容

**Docker 一体化**

- 新增 `Dockerfile.dev`: 基于 node:20-alpine，启动时按需 `npm install` + `prisma generate` + `next dev --turbopack`
- `docker-compose.yml` 加 `app` 服务（`profiles: ["app"]` 控制，默认不启）
- volume mount 设计：源码 bind mount + `node_modules` / `.next` / `prisma-gen` 用 named volume 隔离，避免 host/container 平台差异
- 启动顺序：postgres healthy → redis healthy → rag started → app start
- `host` 模式（`npm run dev`）保留，两种模式 `data/knowledge-bases/` 数据共享

---

### 🔧 Internal Changes

**Storage 层**

- 新 `rag` schema 下 5 张表：`page_ocr / doc_profile / excel_policy / excel_policy_chunk / excel_config`
- 所有 SQL 第一参数 `kb_id`，多租户硬隔离
- 级联删支持 KB 级和 doc 级两种粒度
- 老 LlamaIndex 留下的 3 张 `data_*` 表保留（不再使用，可手动 drop）

**依赖变更**

- `rag-service/requirements.txt`:
  - 移除：`llama-index-*`（6 个包）、`dashscope`、`psycopg2-binary`、`python-docx`
  - 新增：`jieba`、`openpyxl`、`xlrd`、`numpy`
  - 保留：`asyncpg`、`openai`、`PyMuPDF`、`Pillow`、`requests`、`httpx`
- `rag-service/Dockerfile`:
  - 移除 `libpq-dev`（asyncpg 自带协议）、`poppler-utils`（PyMuPDF 不依赖）
  - 保留 `build-essential`、`libreoffice-writer-nogui`（DOCX→PDF 转换）
  - apt 源切到 `mirrors.aliyun.com`，规避 deb.debian.org 在 CN 网络下的不稳定

**代码删除**

`rag-service/app/` 下移除 18 个 LlamaIndex 时期的模块：`step0`–`step4*.py`、`vector_store_management.py`、`reranker.py`、`table_normalizer.py`、`table_summary.py`、`postprocess.py`、`batch_ocr.py`、`document_ingestion.py`、`model_provider_utils.py`、`pipeline_utils.py`、`query_utils.py`、`web_helpers.py`、`data_models.py`

**测试**

新增 22 个单测（FTS 7 + Excel 9 + Retrieval 6），全部通过；不依赖数据库，可在 CI 中独立运行。

---

## v0.4.0 (2026-04-20)

### 🎯 Highlights

- **Resource 自动初始化（Layer A+B）**: 新实例首次连接时，自动把标记为"默认"的 Resource 的 apiKey / baseUrl / models 推送到实例的 `models.providers`，并把"默认模型"设为 `agents.defaults.model.primary`。无需手动在 Config Editor 里配置一次模型。
- **Provider Variants**: 一个 Provider 可以定义多个 region/plan 组合（例如 qwen 的"国内 Coding Plan"、"国际 Standard"）。创建 Resource 时二级下拉选择，每个 variant 有独立的 `modelsDevId` 拉取各自的 model catalog。
- **Config Editor 模型选择器全面改进**: primary + fallbacks 并列显示、支持多字段搜索（按 model id / display name / variant label 搜）、group heading 标注 variant。
- **预置 15 个参考 Skills**: `git clone` 就能用，覆盖浏览器自动化、内容创作、多搜索引擎、数据分析、skill 开发辅助等场景。
- **聊天体验升级**: ECharts / Mermaid 图表渲染、流式消息排队（streaming 期间可继续发）、真实的 Stop 按钮、思考过程 compact。
- **安全硬化**: Next.js 升到 16.2.2（CVE-2025-66478）、npm audit 11→0、RBAC 权限 5 个 bug 修复。

---

### ✨ New Features

**Resource & 实例自动化**

- 新增 `Resource.isDefaultModel` 字段 + `config.defaultModelId`
- Resource Model Panel 每行加 Star icon，点击切换"设为默认模型"
- 同 provider 最多 1 个 `isDefaultModel=true`（DB 层互斥）
- 新实例首次 WebSocket 连接后自动触发 `initInstanceWithDefaultResources`：
  - 查所有 `isDefault=true` 的 MODEL Resources → 构建 provider entries → patch
  - 对 `isDefaultModel=true` 的，把 `<provider>/<defaultModelId>` 写入 `agents.defaults.model.primary`
  - 护栏：只在 `models.providers` 为空时执行，从不覆盖已有 primary
- `models.dev` catalog 替代 LiteLLM：endpoint-aware 同步
- 新增 `/api/v1/resources/models-dev` 按 variant 拉取 catalog

**Provider Variants**

- `ProviderInfo.variants[]`：region × plan 组合合并到父 Provider
  - qwen: `cn-regular / cn-coding / intl-regular / intl-coding`
  - doubao: `regular / coding`
  - moonshot: `intl-regular / cn-regular / coding`
  - minimax: `regular / coding`
- 28 → 25 providers（合并后更清晰）
- 创建 Resource 时 UI 显示二级 variant 下拉
- `test-connection.ts` 根据 variant baseUrl 选择 probe model

**Config Editor 模型选择器**

- 新组件 `ModelBlockField`: primary picker + fallbacks multi-picker 并列显示
  - 适用于 `agents.defaults.model` 和 `agents.defaults.imageModel`
  - 自动根据 value 形式（string 短写 vs `{primary, fallbacks}` 对象）在保存时 collapse / expand
- Picker 搜索支持多字段匹配：model id、display name、provider name、variant label
- Group heading 显示 variant：`通义千问 (Qwen) · 国内 · Coding`
- `scanModelBlock` 支持 string 短形式（OpenClaw 新 schema 默认格式）

**聊天**

- 新增 `ChatChartBlock` (ECharts) 和 `ChatMermaidBlock` (Mermaid) 渲染器
  - 强制应用 legend / pie center & radius 等布局默认值，避免 AI 生成 options 在窄容器里溢出
- Chat Abort: 停止按钮真的 abort agent 运行（发 `chat.abort` 到 gateway），而不是只切 SSE
- Chat Queue: 流式期间可发新消息，gateway 自动排队；排队消息显示时钟徽章
- 思考过程 compact: 连续 thinking / tool-call 折叠为单行可展开 pill bar（垂直空间减少 ~10x）

**Skills 库预置（开箱即用）**

以下 15 个 skill 随 clone 一起分发：

| 类别         | Skills                                                                         |
| ------------ | ------------------------------------------------------------------------------ |
| 浏览器自动化 | `agent-browser`, `browserwing`, `playwright-scraper-skill`                     |
| 搜索         | `baidu-search`, `multi-search-engine`, `vane-search`                           |
| 内容创作     | `anygen-skill`, `content-skills`（含包鱼 markdown→HTML / markdown→公众号）     |
| 数据分析     | `data-analyst`                                                                 |
| 工作流辅助   | `agent-init`, `multi-agent-cn`, `self-improving`, `skill-creator`, `summarize` |
| 商务         | `qcc-cli`（企查查）                                                            |

安装方法：登录后进入 **Skills 管理** 页面，点击"安装到实例"。

---

### 🐛 Bug Fixes

**Config Editor bug 链**（多米诺）

- `provider-sync.ts`: 总是推送 `api` 字段。之前当 apiType 等于默认 `openai-completions` 时会省略，但 OpenClaw bundled plugin 的 `normalizeConfig` 路径不会补这个字段 → 请求路径错误导致 404
- `mergeProvidersIntoPatch` SecretRef 保护收紧: 只在用户显式设置 SecretRef 对象时才跳过 Resource DB 的 apiKey 推送；undefined/string 情况下正常推送明文 key（之前过度保护导致"No API key found for provider"）
- `config-validator.ts` 新增 `flattenDefs` 预处理: OpenClaw 2026.4.15 schema 违反 JSON Schema 规范（`$ref: "#/$defs/*"` 但 `$defs` 嵌在 `plugins.*.config` 下），预处理把嵌套 `$defs` hoist 到根

**RBAC 权限**（5 个 bug）

- Agent list API 按 `InstanceAccess + agentIds` 过滤（之前非管理员能看到所有实例的 Agent）
- Skill install 使用 `canInstallToAgent` 不是 `isAgentVisible`（之前 USER 能装 skill 到 DEFAULT agent）
- Skills 分页在 DB 查询层应用 visibility filter（之前 DEPARTMENT skills 可能不出现，total 不准）
- Department list 对 DEPT_ADMIN 限定自己部门
- Sidebar 导航按 role 过滤（隐藏管理员专用页面）

**Skill Install**

- 使用 `InstanceAccess + AgentMeta` 双层检查（和 `chat.send` 一致）
- 二进制文件写入容器改用 Docker `putArchive` (tar stream)，不用 `exec` + shell

**聊天流式**

- 修 `remoteStreaming` dots 回复后仍持续：`wasStreamingRef` 消费时机调整
- 修 user 消息流式中消失：进度 poll 与 `chat.send` 竞态 → 加 `confirmed` SSE 事件让 poll 等 gateway 确认
- `confirmed` 有 15 秒 fallback 超时保障

**安全**

- Next.js `16.1.6` → `16.2.2`（CVE-2025-66478）
- `npm audit`: 11 漏洞 → 0
  - dompurify `3.2.7` → `3.3.2`（4 个 XSS 修复）
  - lodash-es `4.17.23` → `4.18.0`（2 个 prototype pollution）
  - brace-expansion `1.1.12` → `1.1.13`
- Pre-commit hook 细化 secret 扫描：只匹配真实 secret 值特征（`sk-...`、JWT、PEM、20+ 字符赋值、webhook URL），不再误报 `OPENAI_API_KEY` 这种 env var 名字

**UI**

- Pie chart legend 坍塌: 强制 `legend.orient='horizontal'` + pie `center/radius`
- Instance create dialog: `autoComplete="off"` 阻止浏览器把邮箱填到 Docker 镜像字段
- 默认对话框"自定义 API Key"块收到"高级选项"内，主表单展示"默认使用资源管理中配置的默认模型供应商/模型"一行提示
- Chat 侧边栏 `w-72` → `w-60`，对话区 max-width `3xl` → 950px

**其它**

- 知识库 (RAG) 新版文档补全：README 添加 RAG 功能说明、pgvector 技术栈
- `.gitignore` 添加 chrome_user_data / log / drafts / config.toml（防止本地浏览器工具泄露）

---

### 🔧 Breaking Changes / 迁移指引

**数据库 schema 变更**

- `Resource` 表新增列：`isDefaultModel Boolean @default(false)`
- Dockerfile init CMD 已改为 `prisma db push --accept-data-loss`（新增列无数据损失，标志位允许 prisma 7 自动执行）
- **本地开发**升级后需要手动跑 `npx prisma db push --accept-data-loss` 同步 schema

**升级步骤**

```bash
# 推荐：先备份数据
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U teamclaw teamclaw > backup-pre-v0.4.0.sql

# 升级
git pull
docker compose -f docker-compose.prod.yml build --no-cache app init
docker compose -f docker-compose.prod.yml up -d --force-recreate init app

# init 容器首次启动会自动：
#   1) prisma db push --accept-data-loss （添加 isDefaultModel 列）
#   2) seed 默认管理员 / 部门 / RAG 配置
```

**首次启动后推荐操作**

1. 登录 → **资源管理** → 选一个 Resource → 点击其中一个 Model 行的 **⭐ 星标**，设置"新实例默认模型"
2. 以后创建的新实例无须手动配置模型，会自动绑定该 Resource + 模型

**已存在的实例不会自动重配**

为防止破坏用户手改的配置，`initInstanceWithDefaultResources` 有三层护栏：

- 每个实例每进程只执行一次（in-memory dedup）
- 只在实例 `models.providers` 为空时执行
- 只在 `agents.defaults.model.primary` 未定义时写入

如要让旧实例也应用新默认资源，暂需手动进 Config Editor 选择 model（config-patch 保存时会自动 sync provider entry）。

---

### 📋 Commits

```
6575a6d  feat: seed 15 reference skills (OpenClaw marketplace + custom)
5cc3c1b  feat: variant-aware model picker — heading shows variant, multi-field search
dd5b3de  feat: Resource auto-init, Config Editor bug chain, ProviderVariant model
2053937  feat: add ECharts/Mermaid chat blocks and fix pie chart layout
ad87638  fix: resolve all npm audit vulnerabilities (11→0)
88d83d1  fix: chat streaming bugs, layout optimization, Next.js 16.2.2 security upgrade
5b3407f  fix: RBAC permission enforcement — 5 bugs found and fixed
4778f0a  feat: chat stop/queue, compact process steps, skill install permissions
9365f03  docs: add Knowledge Base (RAG) feature to README
```

---

## v0.3.0 (2026-03-30)

See `git log v0.2.1..v0.3.0` for details (pre-CHANGELOG tag).
