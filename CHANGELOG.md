# Changelog

All notable changes since `v0.3.0` (2026-03-30).

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
