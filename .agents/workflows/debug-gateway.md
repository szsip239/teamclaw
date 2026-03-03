# 工作流：调试 Gateway 连接

参考 SKILL：`.agents/skills/gateway-websocket/SKILL.md`

> ✅ Gateway 服务已实现（阶段三完成）。位于 `server/internal/service/gateway/`

---

## 测试环境

| 资源 | 值 |
|------|-----|
| 测试实例名 | `siliconflow-test` |
| 实例 ID | `80976c64bae6055638c0de99` |
| OpenClaw 地址 | `ws://host.docker.internal:8090`（容器内访问宿主机）|
| 容器名 | `tc-openclaw-test` |
| 实例状态 | ONLINE |

---

## 问题诊断流程

### 1. 确认实例配置正确

```bash
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  # 查看实例列表（注意 status 字段）
  curl -s http://tc-api:3200/api/v1/instances -H "Authorization: Bearer $TOKEN" | grep -o "\"name\":\"[^\"]*\"\|\"status\":\"[^\"]*\""
'

# 直接查数据库（GatewayToken 是 AES 加密的，不可直读）
docker exec tc-postgres psql -U teamclaw -d teamclaw \
  -c "SELECT id, name, gateway_url, status, last_health_check FROM instances;"
```

### 2. 验证 Gateway URL 可达

```bash
# 从 API 容器内测试连通性（tc-openclaw-test 端口 8090）
docker exec tc-api wget -qO- http://tc-openclaw-test:8090/healthz

# 从宿主机测试
curl http://localhost:8090/healthz
```

### 3. 查看 API 容器日志（Gateway 相关）

```bash
docker logs -f tc-api | grep -i "gateway\|websocket\|connect\|heartbeat"
```

### 4. 手动触发 Gateway 连接

```bash
docker run --rm --network teamclaw-dev alpine/curl sh -c '
  TOKEN=$(curl -s -X POST http://tc-api:3200/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"admin@teamclaw.dev\",\"password\":\"TestPass@123\"}" | \
    sed -n "s/.*\"accessToken\":\"\([^\"]*\)\".*/\1/p")
  # 触发连接（实例 ID）
  curl -s -X POST http://tc-api:3200/api/v1/gateway/80976c64bae6055638c0de99/connect \
    -H "Authorization: Bearer $TOKEN"
'
```

### 5. 检查实例状态更新

```bash
docker exec tc-postgres psql -U teamclaw -d teamclaw \
  -c "SELECT id, name, status, last_health_check, updated_at FROM instances ORDER BY updated_at DESC;"
```

---

## 常见错误及解决

| 错误 | 原因 | 解决 |
|------|------|------|
| 实例状态一直是 OFFLINE | Gateway 从未成功连接 | 检查 gatewayUrl 是否可达（见步骤 2）|
| `failed to decrypt token` | ENCRYPTION_KEY 变化 | 删除实例重新创建，填写新 token |
| WebSocket 握手超时 | 网络问题或 OpenClaw 未启动 | `docker ps` 确认 tc-openclaw-test 运行中 |
| 频繁重连 | 实例负载高或心跳超时 | 查看日志确认原因 |
| `clientID must be gateway-client` | 使用了错误的 clientID | `client.go:27` 中 clientID 固定为 `"gateway-client"` |

---

## OpenClaw Gateway 协议要点（Protocol v3）

```
1. 客户端连接 WebSocket
2. 服务端发送 challenge: {"type":"challenge","data":{"nonce":"abc"}}
3. 客户端发送 connect:   {"type":"connect","data":{"clientID":"gateway-client","token":"<token>","nonce":"abc"}}
4. 服务端响应 hello-ok:  {"type":"hello-ok","data":{"sessionId":"xxx"}}
5. 发送请求:             {"type":"request","requestId":"r1","method":"agents.list","data":{}}
6. 接收响应:             {"type":"response","requestId":"r1","data":[...]}
```

**关键**：`clientID` 必须是 `"gateway-client"`，不能是 `"openclaw-control-ui"`（后者需要 device identity）。

---

## Instance 状态机

```
OFFLINE ──[连接成功]──► ONLINE
ONLINE  ──[心跳失败]──► DEGRADED
ONLINE  ──[连接断开]──► OFFLINE
DEGRADED──[超时 2min]─► ERROR
ERROR   ──[重连成功]──► ONLINE
```

健康检查周期：60s 检查，120s 超时阈值（`service/gateway/health.go`）
