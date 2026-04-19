---
name: agent-init
description: "Initialize and configure OpenClaw agent workspace MD files (AGENTS.md, SOUL.md, IDENTITY.md, USER.md, TOOLS.md, BOOTSTRAP.md, HEARTBEAT.md). Use when: setting up a new agent, customizing agent personality/behavior, configuring agent workspace for TeamClaw, or checking/fixing agent environment (Python/uv). Provides interactive interview workflow before generating files. Integrates with TeamClaw session file system (input/output folders) and supports both container and external instances."
---

# Agent Init

Initialize OpenClaw agent workspace with tailored MD files through an interactive interview.

## Workflow

### Phase 1: Interview (MANDATORY — do not skip)

Before generating ANY files, gather context through conversation. Ask in batches of 2-3 questions:

**Batch 1 — Identity & Purpose:**
- What is this agent's primary purpose? (e.g., coding assistant, research, DevOps, personal assistant)
- What name and emoji? Any personality traits?

**Batch 2 — User Profile:**
- Who will use this agent? (name, timezone, preferences)
- Communication style preference? (formal/casual, verbose/terse, language)

**Batch 3 — Environment:**
- Is this a container instance or external instance?
- What tools/languages does the agent need? (Python, Node, etc.)
- Any specific workflows or periodic tasks?

**Batch 4 — Boundaries:**
- Any topics or actions the agent should avoid?
- Privacy requirements beyond defaults?

Only proceed to Phase 2 after user confirms the interview is complete.

### Phase 2: Environment Check

Run `scripts/check-env.sh` to detect Python/uv status:

```bash
bash <skill-path>/scripts/check-env.sh
```

If uv is missing and user wants Python support:
```bash
bash <skill-path>/scripts/check-env.sh --install
```

For container instances, run inside the container:
```bash
docker exec <containerId> bash -c "which uv && uv --version || echo 'uv: NOT FOUND'"
```

### Phase 3: Generate Files

Generate files in this order, showing each to user for confirmation before writing:

1. **IDENTITY.md** — Fill in fields from interview
2. **USER.md** — Fill in user profile
3. **SOUL.md** — Rewrite content, keep 4-section structure (Core Truths / Boundaries / Vibe / Continuity)
4. **TOOLS.md** — Add environment info, Python/uv config, documentation access notes
5. **AGENTS.md** — Extend default template with domain-specific sections (see strategy below)
6. **HEARTBEAT.md** — Add periodic tasks if any
7. **BOOTSTRAP.md** — Skip unless user wants first-run ritual

#### AGENTS.md Strategy: Extend, Don't Replace

Read the current AGENTS.md first. The default template contains critical infrastructure:
- Session startup sequence (file loading order)
- Memory system (daily + MEMORY.md)
- Safety rules
- Heartbeat logic

**Add** new sections; **never remove** existing ones. Safe insertion points:
- After "Every Session" → domain-specific startup tasks
- After "Safety" → TeamClaw security rules + file exchange rules
- After "Tools" → Python/uv preferences, documentation access
- Before "Make It Yours" → project-specific workflows

#### Mandatory AGENTS.md Additions

Always add these to AGENTS.md regardless of agent type:

```markdown
## File Exchange (TeamClaw)
- User uploads appear in `current-session/input/`
- Save output files to `current-session/output/`
- Check input folder at session start for uploaded files
- ALWAYS use `current-session/` symlink — NEVER navigate sessions/ by folder name
  (folders use TeamClaw DB IDs which differ from your OpenClaw session UUID)

## Security (TeamClaw)
- NEVER delete files you didn't create — use `trash` over `rm`
- NEVER display API keys, tokens, passwords, or credentials
- NEVER read other users' session directories
- NEVER use `web_fetch` tool (DNS issues with proxy) — use browser tools instead
- For OpenClaw docs: `qmd query "<topic>"` or `qmd get "openclaw-docs/<path>"`
```

#### Mandatory TOOLS.md Additions

```markdown
## Python
- Package manager: `uv` (NEVER use pip directly)
- Create venv: `uv venv .venv`
- Install: `uv pip install <package>`
- Run: `uv run python script.py`
- If uv missing: `curl -LsSf https://astral.sh/uv/install.sh | sh`

## Documentation
- OpenClaw docs: `qmd query "<topic>"` or `qmd get "openclaw-docs/<path>"`
- Web browsing: use browser tools only (no web_fetch)
```

### Phase 4: Write Files

Determine write method based on instance type:

**External instance** (workspacePath set):
```bash
# Workspace files live at {workspacePath}/workspace/ (or workspace-{profile}/)
cat > {workspacePath}/workspace/SOUL.md << 'ENDOFFILE'
[content]
ENDOFFILE
```

**Container instance** (containerId set):
```bash
docker exec -i <containerId> sh -c 'cat > /home/node/.openclaw/workspace/SOUL.md' << 'ENDOFFILE'
[content]
ENDOFFILE
```

**For non-main agents** (agentId ≠ "main"):
- Check if agent has a dedicated workspace via `config.get`
- Agent workspace might be at `workspace-{agentId}/` or configured separately

### Phase 5: Verify

After writing, confirm files are in place:
```bash
# External
ls -la {workspacePath}/workspace/*.md

# Container
docker exec <containerId> ls -la /home/node/.openclaw/workspace/*.md
```

## Reference Files

- **`references/templates.md`** — Official templates, loading order, per-file strategy, section structure
- **`references/teamclaw-integration.md`** — Instance types, session files, security rules, Python env, gateway notes

Read these when you need detailed guidance on template structure or TeamClaw-specific configuration.

## Rules

1. **Interview first** — never generate files without understanding the user's intent
2. **Extend, don't replace** — AGENTS.md default template is infrastructure, not boilerplate
3. **Show before write** — display each generated file for user confirmation
4. **No web_fetch** — DNS resolution fails under proxy; use browser tools or qmd
5. **uv over pip** — always configure uv as the Python package manager
6. **No secrets in files** — workspace files are injected into every prompt turn
7. **Session isolation** — agent must only access its own session's input/output
8. **Keep files concise** — all workspace files consume tokens every turn (20KB/file limit, 150KB total)
9. **qmd for docs** — use `qmd query` / `qmd get` for OpenClaw documentation, not web fetch
10. **Respect existing content** — read before write, merge non-destructively
