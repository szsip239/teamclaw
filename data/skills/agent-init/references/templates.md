# OpenClaw Official Workspace Templates

These are the default templates OpenClaw generates for new agents. Use them as the BASE — extend, don't replace.

> For the latest official docs, use `qmd query "agent workspace files"` or `qmd get "openclaw-docs/concepts/agent-workspace.md"`.

## File Loading Order (Every Session Turn)

All workspace files are **injected into the system prompt every turn** (token cost!):

```
SOUL.md        → Persona (loaded first)
USER.md        → Human profile
IDENTITY.md    → Agent identity card
TOOLS.md       → Environment notes
HEARTBEAT.md   → Periodic tasks
MEMORY.md      → Long-term memory (main session only)
AGENTS.md      → Operating instructions (loaded last, most context)
BOOTSTRAP.md   → First-run only (deleted after)
```

Daily files (`memory/YYYY-MM-DD.md`) are NOT auto-injected — accessed via `memory_search`/`memory_get` tools.

Limits: `bootstrapMaxChars` = 20000/file, `bootstrapTotalMaxChars` = 150000 total.

## Strategy Per File

| File | Strategy | Reason |
|------|----------|--------|
| AGENTS.md | **Extend** existing template | Contains memory system, safety rules, heartbeat logic — critical infrastructure |
| SOUL.md | **Rewrite** content, **keep** section structure | Core Truths/Boundaries/Vibe/Continuity structure expected |
| IDENTITY.md | **Fill in** fields | Just a form: name, creature, vibe, emoji, avatar |
| USER.md | **Fill in** fields | Just a form: name, pronouns, timezone, notes |
| TOOLS.md | **Add** environment notes to existing structure | Default is a skeleton with examples |
| BOOTSTRAP.md | **Customize** questions or **skip** | One-shot ritual; delete after first run |
| HEARTBEAT.md | **Add** agent-specific periodic tasks | Default is empty |

## AGENTS.md — Key Sections to Preserve

These sections from the default template must NOT be removed:

1. **Every Session** (lines 18-25) — File loading sequence
2. **Memory** (lines 27-53) — Daily + MEMORY.md dual-tier system, "Write It Down" rules
3. **Safety** (lines 55-60) — Data protection, destructive command guardrails
4. **Group Chats** (lines 76-120) — When to speak/stay silent (if agent used in channels)
5. **Heartbeats** (lines 135-215) — Heartbeat response logic, proactive checks

### Safe to Customize

- Add sections after "Every Session" for domain-specific startup tasks
- Add project-specific workflows between Safety and Group Chats
- Customize Heartbeat checklist items
- Add "Make It Yours" content at the end

### Example: Adding a Developer Section

```markdown
## Development Workflow

- Use `uv` for Python package management (not pip)
- Run tests before committing: `uv run pytest`
- Prefer `trash` over `rm` for file deletion
- Check `git status` before starting new work
```

## SOUL.md — Section Structure

Must keep these 4 sections (content can change):

```markdown
## Core Truths
[4-6 personality traits as imperative statements]

## Boundaries
[What the agent won't do, privacy rules]

## Vibe
[Communication style in 1-3 sentences]

## Continuity
[How to handle session restart / memory]
```

## IDENTITY.md — Fields

```markdown
- **Name:** [display name]
- **Creature:** [metaphor — AI, familiar, ghost, etc.]
- **Vibe:** [one-line personality summary]
- **Emoji:** [single emoji]
- **Avatar:** [workspace-relative path, URL, or data URI]
```

## USER.md — Fields

```markdown
- **Name:** [user's name]
- **What to call them:** [preferred address]
- **Pronouns:** [optional]
- **Timezone:** [e.g., Asia/Shanghai]
- **Notes:** [preferences, workflow habits]

## Context
[Current projects, priorities, constraints]
```

## TOOLS.md — Structure

```markdown
## Environment
[OS, shell, package managers, language versions]

## [Category]
[Device names, SSH hosts, API endpoints, etc.]
```

## HEARTBEAT.md — Format

```markdown
# Keep tasks lightweight — runs every ~60 min

- [ ] Task description
- [ ] Another task
```
