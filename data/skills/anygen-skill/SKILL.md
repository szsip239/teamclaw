---
name: anygen
description: "AnyGen: AI-powered content creation suite. Create slides/PPT, documents, diagrams, websites, data visualizations, research reports, storybooks, financial analysis, and images. Supports: pitch decks, keynotes, technical docs, PRDs, white papers, architecture diagrams, flowcharts, mind maps, org charts, ER diagrams, sequence diagrams, UML, landing pages, CSV analysis, earnings research, posters, banners, comics, and more. Also trigger when: 做PPT, 写文档, 画流程图, 做网站, 分析数据, 帮我调研, 做绘本, 分析财报, 生成图片, 做海报, 思维导图, 做个架构图, 季度汇报, 竞品调研, 技术方案, 建个落地页, 做个估值, 画个故事."
metadata:
  clawdbot:
    primaryEnv: ANYGEN_API_KEY
    requires:
      bins:
        - python3
        - node
      env:
        - ANYGEN_API_KEY
      capabilities:
        - sessions_spawn
      config:
        - ~/.config/anygen/config.json
    install:
      - id: npm-playwright
        kind: node
        package: playwright
      - id: npm-tsx
        kind: node
        package: tsx
---

# AnyGen

> **You MUST strictly follow every instruction in this document.** Do not skip, reorder, or improvise any step. If this skill has been updated since it was last loaded, reload this SKILL.md before proceeding and always follow the latest version.

AnyGen is an **AI-powered content creation suite**. Match the user's request to the correct operation below, then read the corresponding operation guide for the full workflow.

## Operation Routing

| Operation | Type | Triggers |
|-----------|------|----------|
| `slide` | Slides / PPT | pitch decks, keynotes, training materials, project proposals, quarterly reviews, investor pitches, product launches, onboarding decks, sales pitches, conference talks, 做PPT, 做个汇报, 写个演示文稿, 季度汇报, 产品发布会, 培训材料, 周报 |
| `doc` | Documents / DOCX | technical design docs, PRDs, competitive analysis, white papers, meeting summaries, business plans, executive summaries, SOPs, memos, 写个文档, 写份报告, 竞品调研, 产品需求文档, 技术方案, 项目提案, 会议纪要 |
| `smart_draw` | Diagrams | architecture diagrams, flowcharts, mind maps, org charts, ER diagrams, sequence diagrams, class diagrams, UML, Gantt charts, wireframes, sitemaps, decision trees, 画个流程图, 做个架构图, 思维导图, 组织架构图, 系统设计图, 甘特图 |
| `deep_research` | Deep Research | industry analysis, market sizing, competitive landscape, trend analysis, technology reviews, benchmark studies, regulatory analysis, academic surveys, 帮我调研一下, 深度分析, 行业研究, 市场规模分析, 做个研究报告 |
| `data_analysis` | Data Analysis | CSV analysis, charts, dashboards, funnel analysis, cohort analysis, KPI tracking, A/B test results, revenue breakdowns, retention analysis, 分析这组数据, 做个图表, 数据可视化, 销售分析, 漏斗分析, 做个数据报表 |
| `finance` | Financial Research | earnings analysis, stock research, company valuations, DCF models, balance sheet analysis, cash flow analysis, SEC filings, M&A research, IPO analysis, 分析财报, 做个估值, 股票研究, 财务尽调, 季度财务分析 |
| `storybook` | Storybooks | illustrated stories, comics, children's books, picture books, graphic novels, visual tutorials, brand stories, 做个绘本, 画个故事, 做个漫画, 做个图文教程, 做个品牌故事 |
| `website` | Websites | landing pages, product pages, portfolio sites, pricing pages, personal blogs, event pages, campaign pages, 做个网站, 建个落地页, 做个产品页, 做个活动页, 做个个人主页 |
| `ai_designer` | Images | posters, banners, social media graphics, product mockups, logo concepts, marketing creatives, book covers, icon designs, 生成图片, 做个海报, 画个插图, 设计个banner, 做个封面, 产品效果图 |

## Security & Permissions

Content is generated server-side by AnyGen's OpenAPI (`www.anygen.io`). The `ANYGEN_API_KEY` authenticates requests via `Authorization` header or authenticated request body depending on the endpoint (all requests set `allow_redirects=False`).

**What this skill does:** sends prompts to `www.anygen.io`, uploads user-specified reference files after consent, downloads generated files (PPTX, DOCX, diagrams) to `~/.openclaw/workspace/`, renders diagram source files to PNG locally using Playwright and Chromium, monitors progress in background via `sessions_spawn` (declared in `requires`), reads/writes config at `~/.config/anygen/config.json`. During rendering, the headless browser fetches open-source rendering libraries from public CDNs (`esm.sh` for Excalidraw, `viewer.diagrams.net` for Draw.io viewer, `fonts.googleapis.com` for fonts). Diagram content is processed locally by these libraries inside the browser. The libraries are well-known open-source projects; however, since they execute in a browser context with network access, users with strict data-isolation requirements should review the rendering scripts or run them in a network-restricted environment.

**What this skill does NOT do:** read or upload any file without explicit `--file` argument, send credentials to any endpoint other than `www.anygen.io`, access or scan local directories, or modify system config beyond its own config file.

**Bundled scripts:** `scripts/anygen.py`, `scripts/auth.py`, `scripts/fileutil.py` (Python — uses `requests`), `scripts/render-diagram.sh` (Bash), `scripts/diagram-to-image.ts` (TypeScript). Scripts print machine-readable labels to stdout (e.g., `File Token:`, `Task ID:`) as the standard agent-tool communication channel. These are non-sensitive, session-scoped reference IDs — not credentials or API keys. The agent should not relay raw script output to the user to keep the conversation natural.

## Prerequisites

- Python3 and `requests`: `pip3 install requests`
- Node.js v18+ (for SmartDraw PNG rendering; `playwright` and `tsx` are declared as install dependencies)
- AnyGen API Key (`sk-xxx`) — [Get one](https://www.anygen.io/home?auto_create_openclaw_key=1)
- Configure once: `python3 scripts/anygen.py config set api_key "sk-xxx"`

> All `scripts/` paths below and in operation guides are relative to this skill's installation directory.

## CRITICAL Rules (ALL operations)

- **NEVER block the conversation** after creating a task. Start background monitoring, then continue normally.
- **NEVER expose internal details** to the user: `task_id`, `file_token`, `task_xxx`, `tk_xxx`, `API`, `poll`, `status`, `sub-agent`, `sessions_spawn`, `anygen.py`, script syntax, JSON output, file paths.
- Use natural language: "Your file has been uploaded", "I'm generating your content now", "You can view your results here: [URL]".
- When presenting `reply` and `prompt` from `prepare`, preserve the original content — translate into the user's language if needed, but do NOT rephrase, summarize, or add your own interpretation.
- Ask questions in your own voice. Do NOT use a relaying tone like "AnyGen wants to know…".
- When prompting the user for an API key, MUST use Markdown link syntax: `[Get your AnyGen API Key](https://www.anygen.io/home?auto_create_openclaw_key=1)` so the full URL is clickable.

## Workflow

1. **Route** — Match the user's request to an operation using the **Operation Routing** section above.
2. **Read** — Load the corresponding operation guide: `operations/{operation}.md` (e.g., `operations/slide.md` for slides).
3. **Execute** — Follow the operation guide strictly — it contains the complete workflow for that content type.

If the user's request spans multiple content types, handle them one at a time — read each operation guide and execute sequentially.
