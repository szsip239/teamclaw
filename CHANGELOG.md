# Changelog

All notable changes since `v0.3.0` (2026-03-30).

---

## v0.5.0 (2026-05-18)

### 🎯 Highlights

- **RAG 引擎完全重写**: 弃用 LlamaIndex，改为 **Postgres-native 混合检索**（FTS via tsvector + dense via pgvector + RRF 融合）。算法栈源自 [llm-rag](https://github.com/biyiyizuilihai/llm-rag) 的工程实践，适配 TeamClaw 的多租户 / RBAC / 凭据透传体系。
- **PDF 来源页面预览**: 对话回答里 PDF 引用旁出现可点击的「第 N 页」chip，点击右侧抽屉打开原始 PDF 并自动跳转到对应页（浏览器原生 PDF 查看器，`#page=N` 锚点跳转）。
- **Excel 字段化检索（后端就绪）**: 新增 `/api/excel/preview` + `/api/excel/config` 两个端点，自动识别表头并按"标题 / 正文 / 过滤字段 / 来源字段"做字段化分块。前端 UI 下一期接入。
- **Docker 全栈一体化**: `docker compose --profile app up -d` 一键起 postgres + redis + rag + Next.js 四个容器，host 端不需要 `npm run dev`。原 host 模式（基础设施 docker + Next.js 本地）保留为可选。
- **RAG 镜像瘦身 82%**: 从 6.31GB → 1.12GB（去掉 llama-index-* / dashscope / psycopg2 等约 1.2GB 依赖）。

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

| 类别 | Skills |
|---|---|
| 浏览器自动化 | `agent-browser`, `browserwing`, `playwright-scraper-skill` |
| 搜索 | `baidu-search`, `multi-search-engine`, `vane-search` |
| 内容创作 | `anygen-skill`, `content-skills`（含包鱼 markdown→HTML / markdown→公众号） |
| 数据分析 | `data-analyst` |
| 工作流辅助 | `agent-init`, `multi-agent-cn`, `self-improving`, `skill-creator`, `summarize` |
| 商务 | `qcc-cli`（企查查） |

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
