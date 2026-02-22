import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type { ChatToolCall, ChatContentBlock } from '@/types/chat'
import { Prisma } from '@/generated/prisma'

function extractText(content: ChatHistoryMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && block.text) parts.push(block.text)
  }
  return parts.join('\n').trim()
}

function extractThinking(content: ChatHistoryMessage['content']): string {
  if (typeof content === 'string') return ''
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'thinking' && block.thinking) parts.push(block.thinking)
  }
  return parts.join('\n').trim()
}

function extractContentBlocks(content: ChatHistoryMessage['content']): ChatContentBlock[] | undefined {
  if (!Array.isArray(content)) return undefined
  const blocks: ChatContentBlock[] = []
  for (const block of content) {
    if (block.type === 'image') {
      let imageUrl = ''
      if (block.source?.type === 'base64' && block.source.data) {
        imageUrl = `data:${block.source.media_type || 'image/png'};base64,${block.source.data}`
      } else if (block.url) {
        imageUrl = block.url
      }
      if (imageUrl) {
        blocks.push({ type: 'image', imageUrl, mimeType: block.source?.media_type })
      }
    }
  }
  return blocks.length > 0 ? blocks : undefined
}

// POST /api/v1/chat/sessions/[id]/clear-context — snapshot messages and reset OpenClaw session
export const POST = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })

    if (!session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }

    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: '无权操作此会话' }, { status: 403 })
    }

    if (!session.isActive) {
      return NextResponse.json({ error: '会话已归档，无法清空上下文' }, { status: 400 })
    }

    // Connect to gateway
    await ensureRegistryInitialized()
    const client = registry.getClient(session.instanceId)
    if (!client) {
      return NextResponse.json({ error: '实例未连接' }, { status: 502 })
    }

    const sessionKey = `agent:${session.agentId}:tc:${session.userId}`

    try {
      // 1. Fetch current messages + OpenClaw session UUID
      const rawResult = await client.request('chat.history', {
        sessionKey,
        limit: 200,
      })
      const historyResult = rawResult as ChatHistoryResult
      const rawMessages = historyResult.messages ?? []

      // 2. If there are messages, create snapshot batch
      if (rawMessages.length > 0) {
        const batchId = randomUUID()
        let orderIndex = 0
        const snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[] = []
        let firstUserMessage: string | null = null

        for (const msg of rawMessages) {
          if (msg.role === 'user') {
            const text = extractText(msg.content)
            const cb = extractContentBlocks(msg.content)
            if (!firstUserMessage && text) firstUserMessage = text
            snapshotData.push({
              chatSessionId: id,
              batchId,
              orderIndex: orderIndex++,
              role: 'user',
              content: text,
              contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
            })
          } else if (msg.role === 'assistant') {
            const text = extractText(msg.content)
            const thinking = extractThinking(msg.content)
            const cb = extractContentBlocks(msg.content)
            const toolCalls: ChatToolCall[] = []
            snapshotData.push({
              chatSessionId: id,
              batchId,
              orderIndex: orderIndex++,
              role: 'assistant',
              content: text,
              contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
              thinking: thinking || null,
              toolCalls: toolCalls.length > 0 ? (toolCalls as unknown as Prisma.InputJsonValue) : undefined,
            })
          } else if (msg.role === 'toolResult') {
            // Merge tool result into the last assistant snapshot
            const lastSnapshot = snapshotData[snapshotData.length - 1]
            if (lastSnapshot?.role === 'assistant') {
              const existing = (lastSnapshot.toolCalls as unknown as ChatToolCall[] | null) ?? []
              existing.push({
                toolName: msg.toolName ?? 'tool',
                toolInput: null,
                toolOutput: extractText(msg.content),
              })
              lastSnapshot.toolCalls = existing as unknown as Prisma.InputJsonValue
            }
          }
        }

        if (snapshotData.length > 0) {
          await prisma.chatMessageSnapshot.createMany({ data: snapshotData })
        }

        // Auto-generate title from first user message if none exists
        if (!session.title && firstUserMessage) {
          await prisma.chatSession.update({
            where: { id },
            data: { title: firstUserMessage.slice(0, 50) },
          })
        }
      }

      // 3. Delete OpenClaw session to reset context
      await client.request('sessions.delete', { key: sessionKey })

      return NextResponse.json({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : '清空上下文失败'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }),
)
