---
description: TeamClaw SSE 流式响应 — Chat 消息的 Server-Sent Events 实现
---

# SSE 流式响应规范

## 状态

**阶段三，尚未实现。** 依赖 Gateway WebSocket 客户端先完成。

---

## SSE 基础

Server-Sent Events（SSE）是单向的服务器推送协议，HTTP 长连接。

```
Client → POST /api/v1/chat/send (JSON body)
Server → 200 OK
         Content-Type: text/event-stream
         Cache-Control: no-cache
         Connection: keep-alive

         data: {"type":"delta","content":"Hello"}

         data: {"type":"delta","content":" world"}

         data: {"type":"done","sessionId":"xxx"}

```

---

## Gin 中的 SSE 实现模式

```go
func (h *ChatHandler) Send(c *gin.Context) {
    var req ChatSendRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        response.BadRequest(c, "invalid request: "+err.Error())
        return
    }

    // 设置 SSE 响应头
    c.Header("Content-Type", "text/event-stream")
    c.Header("Cache-Control", "no-cache")
    c.Header("Connection", "keep-alive")
    c.Header("X-Accel-Buffering", "no")  // 禁用 Nginx 缓冲

    // 获取流式数据
    stream, err := h.registry.Get(instanceID).Stream(c.Request.Context(), "chat.send", req)
    if err != nil {
        // SSE 头已发送，只能通过 event 传递错误
        c.SSEvent("error", gin.H{"message": err.Error()})
        return
    }

    // 转发流式事件
    c.Stream(func(w io.Writer) bool {
        select {
        case msg, ok := <-stream:
            if !ok {
                return false  // 流结束，关闭连接
            }
            c.SSEvent("message", msg)
            return true
        case <-c.Request.Context().Done():
            return false  // 客户端断开
        }
    })
}
```

---

## SSE 事件类型

```go
// 文本增量
type DeltaEvent struct {
    Type    string `json:"type"`    // "delta"
    Content string `json:"content"` // 增量文本
}

// 流结束
type DoneEvent struct {
    Type      string `json:"type"`      // "done"
    SessionID string `json:"sessionId"`
    Usage     *Usage `json:"usage,omitempty"`
}

// 错误事件
type ErrorEvent struct {
    Type    string `json:"type"`    // "error"
    Message string `json:"message"`
}
```

---

## 前端消费 SSE

```typescript
// 前端已有实现参考（Next.js）
const eventSource = new EventSource('/api/v1/chat/send', {
    // SSE 默认是 GET，TeamClaw 用 POST
    // 需要使用 fetch + ReadableStream 替代
});

// 推荐：使用 fetch + ReadableStream 支持 POST + Auth
const response = await fetch('/api/v1/chat/send', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({ agentId, message, sessionId }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    // 解析 SSE 格式：data: {...}\n\n
    parseSSEChunk(text);
}
```

---

## Nginx 配置要求

SSE 需要关闭 Nginx 的代理缓冲：

```nginx
location /api/v1/chat/ {
    proxy_pass         http://api:3200;
    proxy_buffering    off;
    proxy_cache        off;
    proxy_read_timeout 300s;   # SSE 长连接超时
    proxy_http_version 1.1;
    proxy_set_header   Connection "";
}
```

---

## 消息持久化

Chat 消息在流式发送完成后应快照存入 DB：

```go
// 流结束后
snapshot := model.ChatMessageSnapshot{
    BaseModel: newBaseModel(),
    SessionID: session.ID,
    Role:      "assistant",
    Content:   fullContent,  // 累积的完整内容
}
h.db.Create(&snapshot)
```

---

## 路由注册

```go
chat := protected.Group("/chat")
{
    chat.POST("/send",     middleware.RequirePermission(enforcer, "chat", "use"), chatHandler.Send)
    chat.GET("/sessions",  middleware.RequirePermission(enforcer, "sessions", "view_own"), chatHandler.ListSessions)
    chat.GET("/agents",    middleware.RequirePermission(enforcer, "chat", "use"), chatHandler.ListAgents)
}
```

---

## 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| SSE 事件不实时到达 | Nginx 缓冲未关闭 | 添加 `proxy_buffering off` |
| 客户端断开后 goroutine 泄漏 | 未监听 `c.Request.Context().Done()` | 在 `c.Stream()` 中增加 context 监听 |
| 重复发送相同 sessionId | 前端重试时未传入已有 sessionId | 前端应缓存并复用 sessionId |
| 长时间无消息连接断开 | Nginx read_timeout 过短 | 设置 `proxy_read_timeout 300s` |
