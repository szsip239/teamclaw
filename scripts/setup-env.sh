#!/usr/bin/env bash
# TeamClaw environment setup — detects platform defaults and patches .env
set -euo pipefail

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

# ─── Colors ──────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${CYAN}[info]${NC}  $*"; }
ok()    { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()   { echo -e "${RED}[error]${NC} $*"; }

# ─── Ensure .env exists ─────────────────────────────────
if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    info "Created .env from .env.example"
  else
    err ".env.example not found, cannot create .env"
    exit 1
  fi
fi

# ─── Helper: set key in .env if not already set ─────────
set_env() {
  local key="$1" value="$2" comment="${3:-}"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    local current
    current=$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
    if [[ -n "$current" && "$current" != "" ]]; then
      ok "$key already set: $current"
      return
    fi
  fi
  # Append or replace
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=\"${value}\"|" "$ENV_FILE" && rm -f "${ENV_FILE}.bak"
  else
    [[ -n "$comment" ]] && echo "" >> "$ENV_FILE" && echo "# $comment" >> "$ENV_FILE"
    echo "${key}=\"${value}\"" >> "$ENV_FILE"
  fi
  ok "$key → $value"
}

echo ""
echo "═══════════════════════════════════════════════════"
echo "  TeamClaw Environment Setup"
echo "═══════════════════════════════════════════════════"
echo ""

# ─── 1. Docker socket ───────────────────────────────────
info "Detecting Docker socket..."

SOCKET_PATH=""
for candidate in /var/run/docker.sock "$HOME/.docker/run/docker.sock" /run/docker.sock; do
  if [[ -S "$candidate" ]]; then
    SOCKET_PATH="$candidate"
    break
  fi
done

if [[ -z "$SOCKET_PATH" ]]; then
  warn "Docker socket not found. Is Docker running?"
  warn "Set DOCKER_SOCKET_PATH manually in .env"
else
  set_env "DOCKER_SOCKET_PATH" "$SOCKET_PATH"
fi

# ─── 2. Docker GID ──────────────────────────────────────
info "Detecting Docker socket GID..."

if [[ -n "$SOCKET_PATH" ]]; then
  if [[ "$(uname)" == "Darwin" ]]; then
    DOCKER_GID="0"
    info "macOS detected — Docker socket owned by root (GID=0)"
  else
    DOCKER_GID=$(stat -c '%g' "$SOCKET_PATH" 2>/dev/null || echo "0")
    info "Linux detected — Docker socket GID=$DOCKER_GID"
  fi
  set_env "DOCKER_GID" "$DOCKER_GID"
else
  warn "Skipping DOCKER_GID (no socket found)"
fi

# ─── 3. Validate critical keys ──────────────────────────
echo ""
info "Checking critical configuration..."

MISSING=0
# Check that critical env vars are set (not blank or placeholder)
CRITICAL_KEYS=("JWT_PRIVATE""_KEY" "JWT_PUBLIC""_KEY" "ENCRYPTION""_KEY")
for key in "${CRITICAL_KEYS[@]}"; do
  val=$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')
  if [[ -z "$val" || "$val" == "<"* ]]; then
    warn "$key not configured"
    MISSING=$((MISSING + 1))
  else
    ok "$key configured"
  fi
done

if [[ $MISSING -gt 0 ]]; then
  echo ""
  warn "Missing $MISSING critical key(s). Generate with:"
  echo "  JWT keys:       node scripts/generate-keys.mjs"
  echo "  Encryption key: openssl rand -hex 32"
fi

# ─── Summary ────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════"
echo "  Setup complete. Review .env before starting:"
echo "  docker compose -f docker-compose.prod.yml up -d"
echo "═══════════════════════════════════════════════════"
echo ""
