#!/usr/bin/env bash
# TeamClaw Go API — CLI debug tool
# Usage: ./scripts/debug.sh <command> [args...]
#
# Commands:
#   health
#   register [email] [name] [password]
#   login    [email] [password]
#   me
#   users
#   create-user <email> <name> <password> <role>
#   departments
#   create-dept <name>
#   get-dept <id>
#   update-dept <id> <name>
#   delete-dept <id>
#   instances
#   create-instance <name> <gateway-url> <gateway-token>
#   get-instance <id>
#   delete-instance <id>
#   grant-access <instance-id> <dept-id>
#   list-accesses <instance-id>
#   revoke-access <instance-id> <access-id>

set -e

BASE_URL="${TC_BASE_URL:-http://localhost:3200}"
TOKEN_FILE="/tmp/tc_token"

# ── Helpers ──────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'

info()  { echo -e "${CYAN}▶ $*${NC}"; }
ok()    { echo -e "${GREEN}✔ $*${NC}"; }
err()   { echo -e "${RED}✖ $*${NC}" >&2; }

# Pretty-print JSON if jq is available
pretty() {
  if command -v jq &>/dev/null; then jq .; else cat; fi
}

# Load saved token
token() {
  if [[ -f "$TOKEN_FILE" ]]; then cat "$TOKEN_FILE"; fi
}

# Authenticated curl
acurl() {
  local method="$1"; shift
  local path="$1"; shift
  curl -s -X "$method" \
    -H "Authorization: Bearer $(token)" \
    -H "Content-Type: application/json" \
    "$BASE_URL$path" "$@"
}

# ── Commands ─────────────────────────────────────────────

cmd_health() {
  info "GET /healthz"
  curl -s "$BASE_URL/healthz" | pretty
}

cmd_register() {
  local email="${1:-admin@teamclaw.dev}"
  local name="${2:-Admin}"
  local password="${3:-password123}"
  info "POST /api/v1/auth/register  ($email)"
  curl -s -X POST "$BASE_URL/api/v1/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"name\":\"$name\",\"password\":\"$password\"}" | pretty
}

cmd_login() {
  local email="${1:-admin@teamclaw.dev}"
  local password="${2:-password123}"
  info "POST /api/v1/auth/login  ($email)"
  local resp
  resp=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}")
  echo "$resp" | pretty
  local tok
  tok=$(echo "$resp" | (command -v jq &>/dev/null && jq -r '.data.accessToken // empty' || grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4))
  if [[ -n "$tok" ]]; then
    echo "$tok" > "$TOKEN_FILE"
    ok "Token saved to $TOKEN_FILE"
  else
    err "Login failed — token not found in response"
  fi
}

cmd_me() {
  info "GET /api/v1/auth/me"
  acurl GET /api/v1/auth/me | pretty
}

cmd_logout() {
  info "POST /api/v1/auth/logout"
  acurl POST /api/v1/auth/logout | pretty
  rm -f "$TOKEN_FILE"
  ok "Token cleared"
}

# ── Users ────────────────────────────────────────────────

cmd_users() {
  info "GET /api/v1/users"
  acurl GET "/api/v1/users?page=1&pageSize=20" | pretty
}

cmd_create_user() {
  local email="$1" name="$2" password="$3" role="${4:-USER}"
  info "POST /api/v1/users  ($email, role=$role)"
  acurl POST /api/v1/users \
    -d "{\"email\":\"$email\",\"name\":\"$name\",\"password\":\"$password\",\"role\":\"$role\"}" | pretty
}

# ── Departments ──────────────────────────────────────────

cmd_departments() {
  info "GET /api/v1/departments"
  acurl GET "/api/v1/departments?page=1&pageSize=20" | pretty
}

cmd_create_dept() {
  local name="${1:-Engineering}"
  info "POST /api/v1/departments  (name=$name)"
  acurl POST /api/v1/departments \
    -d "{\"name\":\"$name\"}" | pretty
}

cmd_get_dept() {
  local id="$1"
  info "GET /api/v1/departments/$id"
  acurl GET "/api/v1/departments/$id" | pretty
}

cmd_update_dept() {
  local id="$1" name="$2"
  info "PATCH /api/v1/departments/$id  (name=$name)"
  acurl PATCH "/api/v1/departments/$id" \
    -d "{\"name\":\"$name\"}" | pretty
}

cmd_delete_dept() {
  local id="$1"
  info "DELETE /api/v1/departments/$id"
  acurl DELETE "/api/v1/departments/$id" | pretty
}

# ── Instances ────────────────────────────────────────────

cmd_instances() {
  info "GET /api/v1/instances"
  acurl GET "/api/v1/instances?page=1&pageSize=20" | pretty
}

cmd_create_instance() {
  local name="${1:-test-instance}"
  local url="${2:-http://gateway.example.com}"
  local token="${3:-dummy-token}"
  info "POST /api/v1/instances  (name=$name)"
  acurl POST /api/v1/instances \
    -d "{\"name\":\"$name\",\"gatewayUrl\":\"$url\",\"gatewayToken\":\"$token\"}" | pretty
}

cmd_get_instance() {
  local id="$1"
  info "GET /api/v1/instances/$id"
  acurl GET "/api/v1/instances/$id" | pretty
}

cmd_delete_instance() {
  local id="$1"
  info "DELETE /api/v1/instances/$id"
  acurl DELETE "/api/v1/instances/$id" | pretty
}

cmd_list_accesses() {
  local id="$1"
  info "GET /api/v1/instances/$id/accesses"
  acurl GET "/api/v1/instances/$id/accesses" | pretty
}

cmd_grant_access() {
  local inst_id="$1" dept_id="$2"
  info "POST /api/v1/instances/$inst_id/accesses  (dept=$dept_id)"
  acurl POST "/api/v1/instances/$inst_id/accesses" \
    -d "{\"departmentId\":\"$dept_id\",\"agentIds\":[]}" | pretty
}

cmd_revoke_access() {
  local inst_id="$1" access_id="$2"
  info "DELETE /api/v1/instances/$inst_id/accesses/$access_id"
  acurl DELETE "/api/v1/instances/$inst_id/accesses/$access_id" | pretty
}

# ── Dispatch ─────────────────────────────────────────────

CMD="${1:-help}"
shift || true

case "$CMD" in
  health)          cmd_health ;;
  register)        cmd_register "$@" ;;
  login)           cmd_login "$@" ;;
  me)              cmd_me ;;
  logout)          cmd_logout ;;
  users)           cmd_users ;;
  create-user)     cmd_create_user "$@" ;;
  departments)     cmd_departments ;;
  create-dept)     cmd_create_dept "$@" ;;
  get-dept)        cmd_get_dept "$@" ;;
  update-dept)     cmd_update_dept "$@" ;;
  delete-dept)     cmd_delete_dept "$@" ;;
  instances)       cmd_instances ;;
  create-instance) cmd_create_instance "$@" ;;
  get-instance)    cmd_get_instance "$@" ;;
  delete-instance) cmd_delete_instance "$@" ;;
  list-accesses)   cmd_list_accesses "$@" ;;
  grant-access)    cmd_grant_access "$@" ;;
  revoke-access)   cmd_revoke_access "$@" ;;
  help|*)
    echo "Usage: $0 <command> [args]"
    echo ""
    echo "Auth:        health | register | login | me | logout"
    echo "Users:       users | create-user <email> <name> <pass> <role>"
    echo "Departments: departments | create-dept <name> | get-dept <id>"
    echo "             update-dept <id> <name> | delete-dept <id>"
    echo "Instances:   instances | create-instance <name> <url> <token>"
    echo "             get-instance <id> | delete-instance <id>"
    echo "Access:      list-accesses <inst-id> | grant-access <inst-id> <dept-id>"
    echo "             revoke-access <inst-id> <access-id>"
    echo ""
    echo "Env: TC_BASE_URL (default: http://localhost:3200)"
    ;;
esac
