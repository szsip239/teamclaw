---
description: TeamClaw Gateway WebSocket — OpenClaw 实例连接协议与客户端实现
---

# Gateway WebSocket 规范

## 状态

**阶段三，尚未实现。** 规划路径：`server/internal/service/gateway/`

---

## 架构概览

```
TeamClaw API                     OpenClaw Instance
    │                                    │
    │  ws://instance.gatewayUrl/ws       │
    │◄──────────────────────────────────►│
    │                                    │
    │  每个 Instance 一个持久 WS 连接      │
    │  goroutine 管理心跳 + 断线重连       │
    │                                    │
    │  HTTP SSE                          │
    │◄────────────────                   │
  前端用户                               │
```

---

## 连接握手流程

```
1. Client → Server: ws.Dial(gatewayUrl + "/ws")
2. Server → Client: {"type": "challenge", "data": {"nonce": "..."}}
3. Client → Server: {"type": "connect", "data": {"token": "...", "nonce": "..."}}
4. Server → Client: {"type": "hello-ok", "data": {"sessionId": "..."}}

连接建立后进入双向消息模式。
```

---

## 消息格式

```go
type GatewayMessage struct {
    Type      string          `json:"type"`
    RequestID string          `json:"requestId,omitempty"` // 用于关联请求与响应
    Data      json.RawMessage `json:"data,omitempty"`
    Error     *GatewayError   `json:"error,omitempty"`
}

type GatewayError struct {
    Code    int    `json:"code"`
    Message string `json:"message"`
}
```

---

## 已知方法（Method）清单

| 方法名 | 说明 | 响应类型 |
|--------|------|---------|
| `agents.list` | 列出实例上的所有 Agent | Array |
| `agents.get` | 获取单个 Agent 详情 | Object |
| `sessions.list` | 列出会话记录 | Array |
| `sessions.create` | 创建新会话 | Object |
| `chat.send` | 发送聊天消息（流式） | Stream events |
| `chat.abort` | 中止正在进行的聊天 | Ack |
| `config.get` | 获取实例配置 | Object |
| `health.ping` | 心跳检查 | Pong |

---

## 客户端实现规划

```go
// server/internal/service/gateway/client.go

type Client struct {
    instanceID string
    conn       *websocket.Conn
    token      string            // 解密后的 GatewayToken
    send       chan []byte        // 写入队列
    subs       map[string]chan GatewayMessage  // requestId → response channel
    mu         sync.RWMutex
}

// 发送请求并等待响应
func (c *Client) Call(ctx context.Context, method string, data any) (json.RawMessage, error)

// 发送流式请求（用于 chat.send）
func (c *Client) Stream(ctx context.Context, method string, data any) (<-chan GatewayMessage, error)
```

---

## 连接注册表规划

```go
// server/internal/service/gateway/registry.go

type Registry struct {
    clients map[string]*Client  // instanceID → Client
    mu      sync.RWMutex
}

// 获取或建立连接
func (r *Registry) Get(instanceID string) (*Client, error)

// 移除断开的连接
func (r *Registry) Remove(instanceID string)
```

---

## 心跳与断线重连

```go
// 心跳：每 30 秒发送 health.ping
// 连接超时：60 秒无响应视为断开
// 重连策略：指数退避（1s, 2s, 4s, ..., max 60s）

// 在 registry 中对每个 client 启动 goroutine：
go client.readPump()   // 接收消息，检测断开
go client.writePump()  // 发送队列消息 + 心跳
```

---

## 与 Handler 的集成

```go
// handler/chat.go 通过 gateway.Registry 发起请求
type ChatHandler struct {
    db       *gorm.DB
    registry *gateway.Registry
}

func (h *ChatHandler) Send(c *gin.Context) {
    // 1. 获取用户有权访问的 instance
    // 2. 通过 registry 获取 gateway client
    client, err := h.registry.Get(instanceID)
    // 3. 调用 chat.send，获取流式响应
    stream, err := client.Stream(ctx, "chat.send", req)
    // 4. 以 SSE 形式转发给前端
}
```

---

## 调试方法

```bash
# 查看 gateway 连接日志
make docker-logs | grep "gateway"

# 手动测试 WebSocket（需要 wscat 或 websocat）
wscat -c ws://localhost:<gateway-port>/ws

# 模拟 Instance 不可用时的错误处理
docker stop <openclaw-container>
# 观察 teamclaw api 的重连行为
```

---

## AES Token 解密（连接时使用）

Gateway 连接需要解密 `Instance.GatewayToken`：

```go
import "github.com/szsip239/teamclaw/server/internal/pkg/crypto"

enc, _ := crypto.NewEncryptor(cfg.Crypto.EncryptionKey)
plainToken, err := enc.Decrypt(instance.GatewayToken)
if err != nil {
    // token 损坏，实例无法连接
}
// 使用 plainToken 进行握手
```
