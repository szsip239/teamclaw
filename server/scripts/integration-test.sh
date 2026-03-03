#!/usr/bin/env sh
# ─── TeamClaw Go Backend Integration Tests ───────────────────────────────────
#
# Usage (from server/ directory):
#
#   # Start services first:
#   COMPOSE_PROFILES=test docker compose -f docker-compose.dev.yml up -d
#
#   # Run tests inside the test container (reaches api:3200):
#   COMPOSE_PROFILES=test docker compose -f docker-compose.dev.yml run --rm test \
#     sh /dev/stdin < scripts/integration-test.sh
#
#   # OR set API_URL for local run:
#   API_URL=http://localhost:3200 sh scripts/integration-test.sh
#
# Environment variables:
#   API_URL   Base URL of the Go API (default: http://api:3200)
#   ADMIN_EMAIL / ADMIN_PASS   Override default test credentials
# ─────────────────────────────────────────────────────────────────────────────

set -e

API="${API_URL:-http://api:3200}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@teamclaw.dev}"
ADMIN_PASS="${ADMIN_PASS:-TestPass@123}"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); printf "${GREEN}✓${NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL+1)); printf "${RED}✗${NC}  %s\n" "$1"; }
info() { printf "${YELLOW}►${NC}  %s\n" "$1"; }

assert_status() {
  local label="$1"
  local expected="$2"
  local actual="$3"
  if [ "$actual" = "$expected" ]; then
    ok "$label (HTTP $actual)"
  else
    fail "$label — expected HTTP $expected, got $actual"
  fi
}

assert_field() {
  local label="$1"
  local field="$2"
  local body="$3"
  if echo "$body" | grep -q "\"$field\""; then
    ok "$label (field '$field' present)"
  else
    fail "$label — field '$field' missing in response"
    printf "  Response: %s\n" "$body" | head -c 200
  fi
}

# ─── Health check ─────────────────────────────────────────────────────────────
info "1. Health check"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/healthz")
assert_status "GET /healthz" "200" "$STATUS"

# ─── Auth: Login ──────────────────────────────────────────────────────────────
info "2. Auth — Login"
LOGIN_BODY=$(curl -s -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")

STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
assert_status "POST /api/v1/auth/login" "200" "$STATUS"
assert_field "Login response has accessToken" "accessToken" "$LOGIN_BODY"
assert_field "Login response has user" "user" "$LOGIN_BODY"

# Extract access token (portable sh, no jq required)
TOKEN=$(echo "$LOGIN_BODY" | \
  sed 's/.*"accessToken":"\([^"]*\)".*/\1/' | \
  grep -v "{" | head -1)

if [ -z "$TOKEN" ]; then
  fail "Could not extract access token — aborting remaining tests"
  echo "Response: $LOGIN_BODY"
  printf "\n${RED}Tests: $PASS passed, $FAIL failed${NC}\n"
  exit 1
fi
ok "Access token extracted"

AUTH="-H \"Authorization: Bearer $TOKEN\""
do_get()  { curl -s -H "Authorization: Bearer $TOKEN" "$API$1"; }
do_post() { curl -s -X POST  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d "$2" "$API$1"; }

# ─── Auth: Me ────────────────────────────────────────────────────────────────
info "3. Auth — Get current user"
BODY=$(do_get "/api/v1/auth/me")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/auth/me")
assert_status "GET /api/v1/auth/me" "200" "$STATUS"
assert_field "Me response has user" "user" "$BODY"

# ─── Users ───────────────────────────────────────────────────────────────────
info "4. Users — List"
BODY=$(do_get "/api/v1/users")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/users")
assert_status "GET /api/v1/users" "200" "$STATUS"
assert_field "Users list has 'users' field" "users" "$BODY"
assert_field "Users list has 'total' field" "total" "$BODY"

# ─── Departments ──────────────────────────────────────────────────────────────
info "5. Departments — List"
BODY=$(do_get "/api/v1/departments")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/departments")
assert_status "GET /api/v1/departments" "200" "$STATUS"
assert_field "Departments list has 'departments' field" "departments" "$BODY"

# ─── Instances ────────────────────────────────────────────────────────────────
info "6. Instances — List"
BODY=$(do_get "/api/v1/instances")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/instances")
assert_status "GET /api/v1/instances" "200" "$STATUS"
assert_field "Instances list has 'instances' field" "instances" "$BODY"
assert_field "Instances list has 'total' field" "total" "$BODY"

# ─── Agents ───────────────────────────────────────────────────────────────────
info "7. Agents — List"
BODY=$(do_get "/api/v1/agents")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/agents")
assert_status "GET /api/v1/agents" "200" "$STATUS"
assert_field "Agents list has 'agents' field" "agents" "$BODY"

# ─── Skills ───────────────────────────────────────────────────────────────────
info "8. Skills — List"
BODY=$(do_get "/api/v1/skills")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/skills")
assert_status "GET /api/v1/skills" "200" "$STATUS"
assert_field "Skills list has 'skills' field" "skills" "$BODY"

# ─── Resources ────────────────────────────────────────────────────────────────
info "9. Resources — List"
BODY=$(do_get "/api/v1/resources")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/resources")
assert_status "GET /api/v1/resources" "200" "$STATUS"
assert_field "Resources list has 'resources' field" "resources" "$BODY"

# ─── Audit Logs ───────────────────────────────────────────────────────────────
info "10. Audit Logs — List"
BODY=$(do_get "/api/v1/audit-logs")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/audit-logs")
assert_status "GET /api/v1/audit-logs" "200" "$STATUS"
assert_field "Audit logs has 'logs' field" "logs" "$BODY"

# ─── Dashboard ────────────────────────────────────────────────────────────────
info "11. Dashboard — Stats"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/dashboard/stats")
assert_status "GET /api/v1/dashboard/stats" "200" "$STATUS"

# ─── Chat Agents ──────────────────────────────────────────────────────────────
info "12. Chat — List Agents"
BODY=$(do_get "/api/v1/chat/agents")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/chat/agents")
assert_status "GET /api/v1/chat/agents" "200" "$STATUS"
assert_field "Chat agents has 'agents' field" "agents" "$BODY"

# ─── Chat Sessions ────────────────────────────────────────────────────────────
info "13. Chat — List Sessions"
BODY=$(do_get "/api/v1/chat/sessions")
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$API/api/v1/chat/sessions")
assert_status "GET /api/v1/chat/sessions" "200" "$STATUS"
assert_field "Chat sessions has 'sessions' field" "sessions" "$BODY"

# ─── Unauthorized access check ────────────────────────────────────────────────
info "14. Security — Unauthorized access rejected"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/v1/users")
assert_status "GET /api/v1/users without auth" "401" "$STATUS"

# ─── Auth: Logout ─────────────────────────────────────────────────────────────
info "15. Auth — Logout"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $TOKEN" "$API/api/v1/auth/logout")
assert_status "POST /api/v1/auth/logout" "200" "$STATUS"

# ─── Summary ──────────────────────────────────────────────────────────────────
printf "\n"
if [ "$FAIL" -eq 0 ]; then
  printf "${GREEN}All $PASS tests passed!${NC}\n"
else
  printf "${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}\n"
  exit 1
fi
