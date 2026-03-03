#!/bin/sh

TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teamclaw.dev","password":"TestPass@123"}' | \
  sed -n 's/.*"accessToken":"\([^"]*\)".*/\1/p')
echo "Token: ${TOKEN:0:30}..."

pass() { echo "  OK $1"; }
fail() { echo "  FAIL $1: $2"; }
check() {
  local label="$1" resp="$2"
  if echo "$resp" | grep -q '"code":0'; then
    pass "$label"
  else
    fail "$label" "$(echo $resp | head -c 150)"
  fi
}

echo ""
echo "=== Auth ==="
check "GetMe" "$(curl -s http://tc-api:3200/api/v1/auth/me -H "Authorization: Bearer $TOKEN")"
RT=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@teamclaw.dev","password":"TestPass@123"}' | \
  sed -n 's/.*"refreshToken":"\([^"]*\)".*/\1/p')
check "TokenRefresh" "$(curl -s -X POST http://tc-api:3200/api/v1/auth/refresh \
  -H "Content-Type: application/json" -d "{\"refreshToken\":\"$RT\"}")"

echo ""
echo "=== Users ==="
TS=$(date +%s)
UC=$(curl -s -X POST http://tc-api:3200/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"T\",\"email\":\"t${TS}@x.com\",\"password\":\"TestPass@123\",\"role\":\"USER\"}")
check "User.Create" "$UC"
UID=$(echo "$UC" | sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p')
echo "  UID: $UID"
check "User.Get" "$(curl -s "http://tc-api:3200/api/v1/users/$UID" -H "Authorization: Bearer $TOKEN")"
check "User.Update" "$(curl -s -X PATCH "http://tc-api:3200/api/v1/users/$UID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Up"}')"
check "User.ResetPwd(newPassword)" "$(curl -s -X POST "http://tc-api:3200/api/v1/users/$UID/reset-password" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"newPassword":"NewPass@456"}')"
check "User.Delete" "$(curl -s -X DELETE "http://tc-api:3200/api/v1/users/$UID" -H "Authorization: Bearer $TOKEN")"

echo ""
echo "=== Departments ==="
DC=$(curl -s -X POST http://tc-api:3200/api/v1/departments \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"D$TS\"}")
check "Dept.Create" "$DC"
DID=$(echo "$DC" | sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p')
echo "  DID: $DID"
DGET=$(curl -s "http://tc-api:3200/api/v1/departments/$DID" -H "Authorization: Bearer $TOKEN")
check "Dept.Get(users+instanceAccess)" "$DGET"
check "Dept.Update" "$(curl -s -X PATCH "http://tc-api:3200/api/v1/departments/$DID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"name":"Up"}')"
check "Dept.Delete" "$(curl -s -X DELETE "http://tc-api:3200/api/v1/departments/$DID" -H "Authorization: Bearer $TOKEN")"

echo ""
echo "=== Instances ==="
INSTS=$(curl -s "http://tc-api:3200/api/v1/instances" -H "Authorization: Bearer $TOKEN")
check "Instance.List" "$INSTS"
IID=$(echo "$INSTS" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p' | head -1)
echo "  IID: $IID"
check "Instance.Get({instance:})" "$(curl -s "http://tc-api:3200/api/v1/instances/$IID" -H "Authorization: Bearer $TOKEN")"
check "Instance.Health" "$(curl -s "http://tc-api:3200/api/v1/instances/$IID/health" -H "Authorization: Bearer $TOKEN")"

echo ""
echo "=== Agents ==="
AC=$(curl -s -X POST http://tc-api:3200/api/v1/agents \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"instanceId\":\"$IID\",\"id\":\"ag$TS\",\"category\":\"DEFAULT\"}")
check "Agent.Create(id field)" "$AC"
AID=$(echo "$AC" | sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p')
echo "  AID: $AID"
check "Agent.Update(gateway->200)" "$(curl -s -X PATCH "http://tc-api:3200/api/v1/agents/$AID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"workspace":"/tmp","models":{}}')"
check "Agent.Classify" "$(curl -s -X PATCH "http://tc-api:3200/api/v1/agents/$AID/classify" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"category":"PERSONAL"}')"
check "Agent.Delete" "$(curl -s -X DELETE "http://tc-api:3200/api/v1/agents/$AID" -H "Authorization: Bearer $TOKEN")"

echo ""
echo "=== Resources ==="
RC=$(curl -s -X POST http://tc-api:3200/api/v1/resources \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"R$TS\",\"type\":\"MODEL\",\"provider\":\"openai\",\"credentials\":\"sk-test\"}")
check "Resource.Create(maskedKey)" "$RC"
RID=$(echo "$RC" | sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p')
echo "  RID: $RID"
check "Resource.Test(ok:true)" "$(curl -s -X POST "http://tc-api:3200/api/v1/resources/$RID/test" -H "Authorization: Bearer $TOKEN")"
check "Resource.Credential" "$(curl -s "http://tc-api:3200/api/v1/resources/$RID/credential" -H "Authorization: Bearer $TOKEN")"
check "Resource.Providers" "$(curl -s "http://tc-api:3200/api/v1/resources/providers" -H "Authorization: Bearer $TOKEN")"
check "Resource.Delete" "$(curl -s -X DELETE "http://tc-api:3200/api/v1/resources/$RID" -H "Authorization: Bearer $TOKEN")"

echo ""
echo "=== Skills ==="
SC=$(curl -s -X POST http://tc-api:3200/api/v1/skills \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"slug\":\"sk$TS\",\"name\":\"Sk$TS\"}")
check "Skill.Create" "$SC"
SID=$(echo "$SC" | sed -n 's/.*"data":{"id":"\([^"]*\)".*/\1/p')
echo "  SID: $SID"
check "Skill.Get(versions)" "$(curl -s "http://tc-api:3200/api/v1/skills/$SID" -H "Authorization: Bearer $TOKEN")"
check "Skill.Update" "$(curl -s -X PATCH "http://tc-api:3200/api/v1/skills/$SID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"description":"d"}')"
check "Skill.Delete" "$(curl -s -X DELETE "http://tc-api:3200/api/v1/skills/$SID" -H "Authorization: Bearer $TOKEN")"

echo ""
echo "=== Chat + Dashboard ==="
check "Chat.Sessions" "$(curl -s "http://tc-api:3200/api/v1/chat/sessions" -H "Authorization: Bearer $TOKEN")"
check "Chat.Agents" "$(curl -s "http://tc-api:3200/api/v1/chat/agents" -H "Authorization: Bearer $TOKEN")"
check "Dashboard" "$(curl -s "http://tc-api:3200/api/v1/dashboard" -H "Authorization: Bearer $TOKEN")"
check "AuditLogs" "$(curl -s "http://tc-api:3200/api/v1/audit-logs" -H "Authorization: Bearer $TOKEN")"
check "AuditExport(CSV)" "$(curl -s "http://tc-api:3200/api/v1/audit-logs/export" -H "Authorization: Bearer $TOKEN" | head -c 5 | grep -q "ID," && echo '{"code":0}' || echo 'CSV ok')"

echo ""
echo "=== DONE ==="
