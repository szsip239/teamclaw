#!/bin/sh
# api-type-check.sh
# 自动验证所有 Go API 端点的响应是否符合 TypeScript 类型契约。
#
# 用法:
#   docker run --rm --network teamclaw-dev \
#     -v "/c/teamclaw/server/scripts:/scripts:ro" \
#     alpine/curl sh -c "apk add -q jq && sh /scripts/api-type-check.sh"
#
# 如果 jq 已在宿主机安装，可直接在宿主机运行（需修改 API 地址为 localhost:3200）。

API="http://tc-api:3200/api/v1"
PASS=0; FAIL=0; SKIP=0
CITEM=""  # 当前被检查的 item JSON（由 section_list 设置）

# ── 颜色 ────────────────────────────────────────────────
G='\033[0;32m'; R='\033[0;31m'; Y='\033[1;33m'
C='\033[0;36m'; B='\033[1m';    N='\033[0m'

pass() { printf "${G}  ✓${N} %-50s\n" "$1"; PASS=$((PASS+1)); }
fail() { printf "${R}  ✗${N} %-50s  → %s\n" "$1" "$2"; FAIL=$((FAIL+1)); }
skip() { printf "${Y}  ~${N} %-50s  (%s)\n" "$1" "$2"; SKIP=$((SKIP+1)); }
section() { printf "\n${B}${C}══ %s ══${N}\n" "$1"; }

# ── check_field <label> <json> <jq_path> <type> [nullable=false] ─
# type: string | number | boolean | array | object
check_field() {
  local L="$1" D="$2" P="$3" T="$4" NUL="${5:-false}"

  local actual_type
  actual_type=$(printf '%s' "$D" | jq -r "($P | type)" 2>/dev/null)

  case "$actual_type" in
    "null")
      if [ "$NUL" = "true" ]; then
        pass "$L = null (nullable OK)"
      else
        fail "$L" "missing/null — expected $T"
      fi
      ;;
    "$T")
      pass "$L: $T"
      ;;
    *)
      local val
      val=$(printf '%s' "$D" | jq -c "$P" 2>/dev/null | head -c 80)
      fail "$L" "expected $T, got $actual_type ($val)"
      ;;
  esac
}

# ── section_list <title> <api_path> <items_key> ─────────────────
# 调用列表端点，检查信封和分页字段，将第一条 item 存入 $CITEM。
section_list() {
  section "$1"
  CITEM=""

  local resp
  resp=$(curl -sf "$API/$2" -H "Authorization: Bearer $TOKEN" 2>/dev/null) || {
    fail "GET /$2" "curl failed / HTTP error"
    return
  }

  local code
  code=$(printf '%s' "$resp" | jq -r '.code // -1')
  if [ "$code" != "0" ]; then
    fail "envelope" "code=$code, msg=$(printf '%s' "$resp" | jq -r '.message // "?"')"
    return
  fi
  pass "envelope: code=0"

  local data
  data=$(printf '%s' "$resp" | jq '.data')

  for k in "$3" total page pageSize; do
    if printf '%s' "$data" | jq -e "has(\"$k\")" >/dev/null 2>&1; then
      pass "pagination.$k"
    else
      fail "pagination.$k" "missing"
    fi
  done

  CITEM=$(printf '%s' "$data" | jq ".$3[0] // empty")
  if [ -z "$CITEM" ]; then
    skip "item fields" "no items — skipping field checks"
    CITEM=""
  fi
}

# ── section_single <title> <api_path> ───────────────────────────
# 调用单条端点，检查信封，将 data 存入 $CITEM。
section_single() {
  section "$1"
  CITEM=""

  local resp
  resp=$(curl -sf "$API/$2" -H "Authorization: Bearer $TOKEN" 2>/dev/null) || {
    fail "GET /$2" "curl failed / HTTP error"
    return
  }

  local code
  code=$(printf '%s' "$resp" | jq -r '.code // -1')
  if [ "$code" != "0" ]; then
    fail "envelope" "code=$code, msg=$(printf '%s' "$resp" | jq -r '.message // "?"')"
    return
  fi
  pass "envelope: code=0"
  CITEM=$(printf '%s' "$resp" | jq '.data')
}

# ════════════════════════════════════════════════════════════════
# AUTH
# ════════════════════════════════════════════════════════════════
section "AUTH"
LOGIN=$(curl -sf -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teamclaw.dev","password":"TestPass@123"}' 2>/dev/null)
TOKEN=$(printf '%s' "$LOGIN" | jq -r '.data.accessToken // empty')
if [ -z "$TOKEN" ]; then
  printf "${R}  FATAL: 无法获取 auth token${N}\n"
  exit 1
fi
printf "${G}  ✓ Auth token 已获取${N}\n"

# ════════════════════════════════════════════════════════════════
# DASHBOARD → DashboardResponse
# ════════════════════════════════════════════════════════════════
section_single "GET /dashboard → DashboardResponse" "dashboard"
if [ -n "$CITEM" ]; then
  DSTATS=$(printf '%s' "$CITEM" | jq '.stats // empty')
  if [ -n "$DSTATS" ]; then
    pass "stats: object"
    for f in totalInstances onlineInstances totalUsers activeUsers totalSessions totalResources totalSkills; do
      check_field "stats.$f" "$DSTATS" ".$f" "number"
    done
  else
    fail "stats" "missing or not an object"
  fi
  for f in instanceHealth providerDistribution recentActivity; do
    check_field "$f" "$CITEM" ".$f" "array"
  done
fi

# ════════════════════════════════════════════════════════════════
# USERS → UserResponse
# ════════════════════════════════════════════════════════════════
section_list "GET /users → UserResponse[]" "users?pageSize=5" "users"
if [ -n "$CITEM" ]; then
  check_field "id"             "$CITEM" ".id"             "string"
  check_field "email"          "$CITEM" ".email"          "string"
  check_field "name"           "$CITEM" ".name"           "string"
  check_field "avatar"         "$CITEM" ".avatar"         "string" "true"
  check_field "role"           "$CITEM" ".role"           "string"
  check_field "status"         "$CITEM" ".status"         "string"
  check_field "departmentId"   "$CITEM" ".departmentId"   "string" "true"
  check_field "departmentName" "$CITEM" ".departmentName" "string" "true"
  check_field "lastLoginAt"    "$CITEM" ".lastLoginAt"    "string" "true"
  check_field "createdAt"      "$CITEM" ".createdAt"      "string"
  check_field "updatedAt"      "$CITEM" ".updatedAt"      "string"
fi

# ════════════════════════════════════════════════════════════════
# DEPARTMENTS → DepartmentResponse
# ════════════════════════════════════════════════════════════════
section_list "GET /departments → DepartmentResponse[]" "departments?pageSize=5" "departments"
DEPT_ID=""
if [ -n "$CITEM" ]; then
  DEPT_ID=$(printf '%s' "$CITEM" | jq -r '.id')
  check_field "id"          "$CITEM" ".id"          "string"
  check_field "name"        "$CITEM" ".name"        "string"
  check_field "description" "$CITEM" ".description" "string" "true"
  check_field "userCount"   "$CITEM" ".userCount"   "number"
  check_field "accessCount" "$CITEM" ".accessCount" "number"
  check_field "createdAt"   "$CITEM" ".createdAt"   "string"
  check_field "updatedAt"   "$CITEM" ".updatedAt"   "string"
fi

# Department detail
if [ -n "$DEPT_ID" ]; then
  section_single "GET /departments/:id → DepartmentDetailResponse" "departments/$DEPT_ID"
  if [ -n "$CITEM" ]; then
    check_field "id"             "$CITEM" ".id"             "string"
    check_field "name"           "$CITEM" ".name"           "string"
    check_field "userCount"      "$CITEM" ".userCount"      "number"
    check_field "accessCount"    "$CITEM" ".accessCount"    "number"
    check_field "users"          "$CITEM" ".users"          "array"
    check_field "instanceAccess" "$CITEM" ".instanceAccess" "array"
  fi
else
  skip "DepartmentDetail" "no department found"
fi

# ════════════════════════════════════════════════════════════════
# INSTANCES → InstanceResponse
# ════════════════════════════════════════════════════════════════
section_list "GET /instances → InstanceResponse[]" "instances?pageSize=5" "instances"
if [ -n "$CITEM" ]; then
  check_field "id"              "$CITEM" ".id"              "string"
  check_field "name"            "$CITEM" ".name"            "string"
  check_field "description"     "$CITEM" ".description"     "string" "true"
  check_field "gatewayUrl"      "$CITEM" ".gatewayUrl"      "string"
  check_field "containerId"     "$CITEM" ".containerId"     "string" "true"
  check_field "containerName"   "$CITEM" ".containerName"   "string" "true"
  check_field "imageName"       "$CITEM" ".imageName"       "string"
  check_field "status"          "$CITEM" ".status"          "string"
  check_field "lastHealthCheck" "$CITEM" ".lastHealthCheck" "string" "true"
  check_field "createdById"     "$CITEM" ".createdById"     "string"
  check_field "createdAt"       "$CITEM" ".createdAt"       "string"
  check_field "updatedAt"       "$CITEM" ".updatedAt"       "string"
fi

# ════════════════════════════════════════════════════════════════
# AGENTS → AgentOverview
# ════════════════════════════════════════════════════════════════
section_list "GET /agents → AgentOverview[]" "agents?pageSize=5" "agents"
if [ -n "$CITEM" ]; then
  check_field "id"           "$CITEM" ".id"           "string"
  check_field "instanceId"   "$CITEM" ".instanceId"   "string"
  check_field "instanceName" "$CITEM" ".instanceName" "string"
  check_field "agentId"      "$CITEM" ".agentId"      "string"
  check_field "name"         "$CITEM" ".name"         "string"
  check_field "category"     "$CITEM" ".category"     "string"
  check_field "createdAt"    "$CITEM" ".createdAt"    "string" "true"
  check_field "updatedAt"    "$CITEM" ".updatedAt"    "string" "true"
fi

# ════════════════════════════════════════════════════════════════
# SKILLS list → SkillOverview
# ════════════════════════════════════════════════════════════════
section_list "GET /skills → SkillOverview[]" "skills?pageSize=5" "skills"
SKILL_ID=""
if [ -n "$CITEM" ]; then
  SKILL_ID=$(printf '%s' "$CITEM" | jq -r '.id')
  check_field "id"                "$CITEM" ".id"                "string"
  check_field "slug"              "$CITEM" ".slug"              "string"
  check_field "name"              "$CITEM" ".name"              "string"
  check_field "description"       "$CITEM" ".description"       "string" "true"
  check_field "emoji"             "$CITEM" ".emoji"             "string" "true"
  check_field "category"          "$CITEM" ".category"          "string"
  check_field "source"            "$CITEM" ".source"            "string"
  check_field "version"           "$CITEM" ".version"           "string"
  check_field "creatorName"       "$CITEM" ".creatorName"       "string"
  check_field "installationCount" "$CITEM" ".installationCount" "number"
  check_field "tags"              "$CITEM" ".tags"              "array"
  check_field "departments"       "$CITEM" ".departments"       "array"
  check_field "createdAt"         "$CITEM" ".createdAt"         "string"
  check_field "updatedAt"         "$CITEM" ".updatedAt"         "string"
fi

# ════════════════════════════════════════════════════════════════
# SKILL detail → SkillDetail
# ════════════════════════════════════════════════════════════════
if [ -n "$SKILL_ID" ]; then
  section_single "GET /skills/:id → SkillDetail" "skills/$SKILL_ID"
  if [ -n "$CITEM" ]; then
    check_field "id"                "$CITEM" ".id"                "string"
    check_field "slug"              "$CITEM" ".slug"              "string"
    check_field "version"           "$CITEM" ".version"           "string"
    check_field "homepage"          "$CITEM" ".homepage"          "string" "true"
    check_field "clawhubSlug"       "$CITEM" ".clawhubSlug"       "string" "true"
    check_field "installationCount" "$CITEM" ".installationCount" "number"
    check_field "tags"              "$CITEM" ".tags"              "array"
    check_field "departments"       "$CITEM" ".departments"       "array"
    check_field "versions"          "$CITEM" ".versions"          "array"
    check_field "createdAt"         "$CITEM" ".createdAt"         "string"
    check_field "updatedAt"         "$CITEM" ".updatedAt"         "string"
  fi
else
  skip "SkillDetail" "no skill found in list"
fi

# ════════════════════════════════════════════════════════════════
# RESOURCES → ResourceOverview
# ════════════════════════════════════════════════════════════════
section_list "GET /resources → ResourceOverview[]" "resources?pageSize=5" "resources"
if [ -n "$CITEM" ]; then
  check_field "id"            "$CITEM" ".id"            "string"
  check_field "name"          "$CITEM" ".name"          "string"
  check_field "type"          "$CITEM" ".type"          "string"
  check_field "provider"      "$CITEM" ".provider"      "string"
  check_field "providerName"  "$CITEM" ".providerName"  "string"
  check_field "status"        "$CITEM" ".status"        "string"
  check_field "maskedKey"     "$CITEM" ".maskedKey"     "string"
  check_field "isDefault"     "$CITEM" ".isDefault"     "boolean"
  check_field "lastTestedAt"  "$CITEM" ".lastTestedAt"  "string" "true"
  check_field "lastTestError" "$CITEM" ".lastTestError" "string" "true"
  check_field "createdByName" "$CITEM" ".createdByName" "string"
  check_field "createdAt"     "$CITEM" ".createdAt"     "string"
  check_field "updatedAt"     "$CITEM" ".updatedAt"     "string"
fi

# ════════════════════════════════════════════════════════════════
# AUDIT LOGS → AuditLogEntry
# ════════════════════════════════════════════════════════════════
section_list "GET /audit-logs → AuditLogEntry[]" "audit-logs?pageSize=5" "logs"
if [ -n "$CITEM" ]; then
  check_field "id"         "$CITEM" ".id"         "string"
  check_field "userId"     "$CITEM" ".userId"     "string"
  check_field "userName"   "$CITEM" ".userName"   "string"
  check_field "action"     "$CITEM" ".action"     "string"
  check_field "resource"   "$CITEM" ".resource"   "string"
  check_field "resourceId" "$CITEM" ".resourceId" "string" "true"
  check_field "ipAddress"  "$CITEM" ".ipAddress"  "string"
  check_field "userAgent"  "$CITEM" ".userAgent"  "string" "true"
  check_field "result"     "$CITEM" ".result"     "string"
  check_field "createdAt"  "$CITEM" ".createdAt"  "string"
fi

# ════════════════════════════════════════════════════════════════
# SUMMARY
# ════════════════════════════════════════════════════════════════
TOTAL=$((PASS+FAIL+SKIP))
printf "\n${B}══════════════════════════════════════════${N}\n"
printf "${B}RESULT${N}  Total: %d  |  ${G}PASS: %d${N}  |  ${R}FAIL: %d${N}  |  ${Y}SKIP: %d${N}\n" \
  "$TOTAL" "$PASS" "$FAIL" "$SKIP"
if [ "$FAIL" -eq 0 ]; then
  printf "${G}  All type contracts satisfied ✓${N}\n"
else
  printf "${R}  %d contract violation(s) — fix backend handlers or TS types${N}\n" "$FAIL"
fi
printf "${B}══════════════════════════════════════════${N}\n"

[ "$FAIL" -eq 0 ]
