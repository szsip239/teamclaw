---
name: vane-search
description: "Vane (Perplexica) AI 搜索引擎 API 调用。通过本地部署的 Vane 服务进行带引用的深度搜索，支持网页/学术/Reddit 来源，三档深度模式(speed/balanced/quality)，返回 AI 总结 + 来源引用。适用于调研、信息收集、深度分析等场景。"
---

# Vane Search API

本地部署的 Vane (Perplexica) AI 搜索引擎，通过 SearxNG 搜索 + Embedding 重排序 + LLM 总结，返回带引用来源的深度回答。

## 服务地址

- **API**: `http://localhost:3010/api/search` (POST)
- **Web UI**: `http://localhost:3010`
- **容器名**: `vane`

## 快速调用

```bash
curl -s -X POST "http://localhost:3010/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "你的搜索问题",
    "sources": ["web"],
    "chatModel": {
      "providerId": "00a2a3e5-5949-4938-9842-037ffa97a47a",
      "key": "qwen3.5-plus"
    },
    "embeddingModel": {
      "providerId": "2e10b45d-b8aa-4dfd-8124-c11f86abcba8",
      "key": "text-embedding-v3"
    }
  }'
```

## 完整参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `query` | string | ✅ | — | 搜索/提问内容 |
| `sources` | string[] | ✅ | — | 搜索来源，见下方来源列表 |
| `chatModel` | object | ✅ | — | `{providerId, key}` 聊天模型 |
| `embeddingModel` | object | ✅ | — | `{providerId, key}` 向量模型 |
| `optimizationMode` | string | ❌ | `"speed"` | 搜索深度：`speed` / `balanced` / `quality` |
| `stream` | boolean | ❌ | `false` | 是否流式输出 |
| `history` | array | ❌ | `[]` | 对话历史，用于多轮追问 |
| `systemInstructions` | string | ❌ | `""` | 自定义系统指令，控制回答风格 |
| `followUp` | boolean | ❌ | `false` | 追问模式 |

## 模型配置

### Chat Model (必填)

当前配置为通义千问 (DashScope OpenAI-compatible API)：

```json
{
  "providerId": "00a2a3e5-5949-4938-9842-037ffa97a47a",
  "key": "qwen3.5-plus"
}
```

### Embedding Model (必填)

当前配置为 DashScope text-embedding-v3 (中文向量模型)：

```json
{
  "providerId": "2e10b45d-b8aa-4dfd-8124-c11f86abcba8",
  "key": "text-embedding-v3"
}
```

## sources 搜索来源

| 值 | 说明 |
|----|------|
| `"web"` | 网页搜索（通用，最常用） |
| `"academic"` | 学术论文搜索 |
| `"reddit"` | Reddit 讨论搜索 |

可组合使用：`["web", "academic"]`

## optimizationMode 搜索深度

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| `"speed"` | 快速模式，搜索少量来源，直接生成回答 | 简单事实查询、快速确认 |
| `"balanced"` | 均衡模式，搜索更多来源，回答更详细 | 一般调研、信息收集 |
| `"quality"` | 深度模式，多轮推理搜索，最全面最慢 | 深度调研、竞品分析、技术选型 |

## 返回格式

```json
{
  "message": "AI 生成的 Markdown 格式回答（含 [N] 引用标记）",
  "sources": [
    {
      "title": "来源标题",
      "url": "来源URL",
      "content": "来源摘要内容"
    }
  ]
}
```

## 使用示例

### 快速搜索 (speed)

```bash
curl -s -X POST "http://localhost:3010/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Claude Code 最新版本是什么",
    "sources": ["web"],
    "chatModel": {"providerId": "00a2a3e5-5949-4938-9842-037ffa97a47a", "key": "qwen3.5-plus"},
    "embeddingModel": {"providerId": "2e10b45d-b8aa-4dfd-8124-c11f86abcba8", "key": "text-embedding-v3"}
  }'
```

### 深度调研 (quality)

```bash
curl -s -X POST "http://localhost:3010/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "2025年主流 AI Agent 框架对比分析",
    "sources": ["web", "academic"],
    "optimizationMode": "quality",
    "systemInstructions": "用中文回答，重点分析技术架构差异和适用场景",
    "chatModel": {"providerId": "00a2a3e5-5949-4938-9842-037ffa97a47a", "key": "qwen3.5-plus"},
    "embeddingModel": {"providerId": "2e10b45d-b8aa-4dfd-8124-c11f86abcba8", "key": "text-embedding-v3"}
  }'
```

### 多轮追问

```bash
curl -s -X POST "http://localhost:3010/api/search" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "其中哪个框架最适合企业级部署？",
    "sources": ["web"],
    "history": [
      {"role": "user", "content": "2025年主流 AI Agent 框架有哪些"},
      {"role": "assistant", "content": "主流框架包括 LangChain、CrewAI、AutoGen..."}
    ],
    "chatModel": {"providerId": "00a2a3e5-5949-4938-9842-037ffa97a47a", "key": "qwen3.5-plus"},
    "embeddingModel": {"providerId": "2e10b45d-b8aa-4dfd-8124-c11f86abcba8", "key": "text-embedding-v3"}
  }'
```

## 服务管理

```bash
# 查看状态
docker ps --filter name=vane

# 查看日志
docker logs vane --tail 20

# 重启
docker restart vane

# 停止/启动
docker stop vane
docker start vane
```
