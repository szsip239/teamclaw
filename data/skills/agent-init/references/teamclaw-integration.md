# TeamClaw Integration Guide

## Instance Types

TeamClaw manages two types of OpenClaw instances:

### Container Instance (`containerId` is set)
- Runs in Docker container (image: `alpine/openclaw:latest`)
- File operations via `docker exec`
- Workspace inside container: `/home/node/.openclaw/workspace/`
- Agent workspaces: `/workspace/{agentId}/` (Docker volume mount)
- Python: 3.11.2, uv pre-installed, pip3 available
- Sandbox support (Docker-in-Docker) available

### External Instance (`workspacePath` is set, `containerId` is null)
- Runs on host machine (e.g., `/Users/clawdbot/.openclaw`)
- File operations via direct filesystem
- Workspace at `{workspacePath}/` (the `.openclaw` directory)
- Agent workspace MD files at `{workspacePath}/workspace/` (or `workspace-{profile}/`)
- Python/uv depends on host environment
- No sandbox, no Docker exec access

### How to Distinguish

```
containerId != null  →  Container instance  →  Use docker exec
workspacePath != null  →  External instance  →  Use filesystem
```

## Session File Structure

TeamClaw creates per-session file areas for each agent conversation:

### Container Instance Paths
```
/workspace/{agentId}/sessions/{chatSessionId}/
├── input/      ← User uploads files here (via TeamClaw file panel)
├── output/     ← Agent writes output files here
└── current-session → symlink to active session
```

### External Instance Paths
```
{workspacePath}/agents/{agentId}/sessions/{chatSessionId}/
├── input/      ← User uploads files here
├── output/     ← Agent writes output files here
```

### Three Session IDs (Important — Don't Confuse!)

The `sessions/` directory contains files from two systems with different ID formats:

| ID | Format | Source | In sessions/ dir |
|---|---|---|---|
| **ChatSession ID** | cuid (`cmmhf6mf4...`) | TeamClaw DB primary key | **Folder names** `sessions/{cuid}/input\|output/` |
| **OpenClaw Session ID** | UUID (`d7fe8409-...`) | OpenClaw internal | `.jsonl` files (agent conversation logs) |
| **Gateway Session Key** | `agent:{agentId}:tc:{userId}` | TeamClaw gateway protocol | Not visible on filesystem |

**The agent sees its own session as the OpenClaw UUID**, but the file exchange folders use **TeamClaw cuids**. These do NOT match. The agent CANNOT derive the folder path from its own session ID.

### current-session Symlink (Required Access Method)

- Path: `/workspace/{agentId}/current-session` (container) or `{workspacePath}/agents/{agentId}/current-session` (external)
- Points to active session directory: `sessions/{chatSessionId-cuid}`
- Updated by TeamClaw every time a message is sent
- **This is the ONLY reliable way for the agent to find its session files**

### What to Tell the Agent

Add to AGENTS.md or TOOLS.md:
```markdown
## File Exchange
- User uploads appear in `current-session/input/`
- Save output files to `current-session/output/`
- Check input folder at session start for any uploaded files
- Keep output organized: use subdirectories for multi-file output
- NEVER navigate sessions/ by ID — the folder names use TeamClaw IDs (cuid), not your session UUID
- ALWAYS use the `current-session` symlink to access input/output
```

## Python Environment Setup

### Container Instance (teamclaw-data example)
- Python 3.11.2 at `/usr/bin/python3`
- uv 0.10.6 at `/usr/local/bin/uv`
- pip3 23.0.1 at `/usr/bin/pip3`
- Home: `/home/node/`

### Host Environment (macOS example)
- System Python 3.9.6 at `/usr/bin/python3`
- uv 0.9.27 at `/opt/homebrew/bin/uv` (via Homebrew)
- pip3 21.2.4 at `/usr/bin/pip3`

### TOOLS.md Python Section Template
```markdown
## Python Environment
- Package manager: `uv` (preferred over pip/pip3)
- Create venv: `uv venv .venv`
- Install package: `uv pip install <package>`
- Run script: `uv run python script.py`
- NEVER use `pip install` directly — always use `uv`
- If `uv` is missing, install: `curl -LsSf https://astral.sh/uv/install.sh | sh`
```

## Security Rules for AGENTS.md

Add these to the Safety section:

```markdown
## Security (TeamClaw Rules)

### File Safety
- NEVER delete files you didn't create
- Use `trash` over `rm` when available
- Before removing: verify the file was created in current session

### Secrets
- NEVER display API keys, tokens, passwords, or credentials
- If a file contains secrets, summarize without showing values
- Environment variables with KEY/TOKEN/SECRET/PASSWORD in name → redact

### Session Isolation
- NEVER read other users' session directories
- Only access files in YOUR session's input/output folders
- The `current-session/` symlink is your boundary

### Network
- NEVER use `web_fetch` tool (DNS resolution issues with proxy setup)
- For web access, use browser tools or ask the user to provide content
- For OpenClaw docs, use `qmd query` or `qmd get` commands
```

## Documentation Access

OpenClaw docs are indexed locally via `qmd`:

```bash
# Search docs
qmd query "topic description"

# Get specific doc
qmd get "openclaw-docs/path/to/file.md"

# List indexed files
qmd ls openclaw-docs
```

Add to TOOLS.md:
```markdown
## Documentation
- OpenClaw docs: `qmd query "<topic>"` or `qmd get "openclaw-docs/<path>"`
- Do NOT use web_fetch for documentation lookups
```

## Agent Creation Rules

### Agent ID Format
- Regex: `^[a-z0-9][a-z0-9_-]*$` (1-50 chars)
- Lowercase alphanumeric, hyphens, underscores
- Must start with letter or digit
- Examples: `main`, `internet`, `dev-assistant`, `code_review`

### Workspace Path Conventions
- Container default agent: `/workspace/default/`
- Container named agent: `/workspace/{agentId}/`
- External default: `~/.openclaw/workspace/`
- External named agent: `~/.openclaw/workspace-{agentId}/`

### Non-Main Agent Workspaces
Each agent gets an **independent workspace**. Files, venvs, and memory are per-agent.
System tools (python, uv, brew) are shared across agents on the same instance.

When initializing a non-main agent, the workspace MD files need to be written to
the agent's own workspace directory, not the default workspace.

### Config Patch Behavior
- `config.patch` uses **union merge** for `agents.list` — send only new entries
- Every `config.patch` triggers OpenClaw restart via SIGUSR1 (~10-20s downtime)
- `config.get` returns `__OPENCLAW_REDACTED__` for secrets — NEVER send these back
- Container must have `restart: unless-stopped` to survive SIGUSR1

## Gateway Connection Notes

- Chat messages flow through WebSocket (GatewayClient)
- Session key format: `agent:<agentId>:tc:<userId>`
- All sessions for same user+agent share ONE gateway key
- `sessions.delete` destroys the active context — never call unless session is inactive

## Agent Presets for TeamClaw

### Developer Agent (Recommended TOOLS.md additions)
```markdown
## Development
- Build: Next.js 16, TypeScript 5, Tailwind 4
- DB: Prisma 7 + PostgreSQL 17
- Cache: Redis 7 (ioredis)
- Auth: jose 6 (RS256 JWT)
- Docker: docker compose for services

## Python
- Manager: uv (never pip)
- Create env: uv venv .venv && source .venv/bin/activate
- Install: uv pip install <pkg>
```

### Research Agent (Recommended TOOLS.md additions)
```markdown
## Research Tools
- Web browsing: browser tools only (no web_fetch)
- Docs: qmd query/get for OpenClaw docs
- Save findings to current-session/output/
```
