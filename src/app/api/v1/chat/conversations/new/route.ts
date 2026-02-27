import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type { ChatToolCall, ChatContentBlock } from '@/types/chat'
import { Prisma } from '@/generated/prisma'

const bodySchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
})

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

// POST /api/v1/chat/conversations/new — archive current session and create a new one
export const POST = withAuth(
  withPermission('chat:use', async (req, { user }) => {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400 },
      )
    }

    const { instanceId, agentId } = parsed.data

    // Permission check
    if (user.role !== 'SYSTEM_ADMIN') {
      if (!user.departmentId) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
      }
      const access = await prisma.instanceAccess.findUnique({
        where: {
          departmentId_instanceId: {
            departmentId: user.departmentId,
            instanceId,
          },
        },
      })
      if (!access) {
        return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
      }
      const allowedIds = access.agentIds as string[] | null
      if (allowedIds && !allowedIds.includes(agentId)) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
      }
    }

    const sessionKey = `agent:${agentId}:tc:${user.id}`

    // Find current active session
    const activeSession = await prisma.chatSession.findFirst({
      where: { userId: user.id, instanceId, agentId, isActive: true },
    })

    if (activeSession) {
      // Archive the active session: snapshot messages + mark inactive
      await ensureRegistryInitialized()
      const client = registry.getClient(instanceId)

      if (client) {
        try {
          const rawResult = await client.request('chat.history', {
            sessionKey,
            limit: 200,
          })
          const historyResult = rawResult as ChatHistoryResult
          const rawMessages = historyResult.messages ?? []

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
                  chatSessionId: activeSession.id,
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
                  chatSessionId: activeSession.id,
                  batchId,
                  orderIndex: orderIndex++,
                  role: 'assistant',
                  content: text,
                  contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
                  thinking: thinking || null,
                  toolCalls: toolCalls.length > 0 ? (toolCalls as unknown as Prisma.InputJsonValue) : undefined,
                })
              } else if (msg.role === 'toolResult') {
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

            // Auto-generate title
            if (!activeSession.title && firstUserMessage) {
              await prisma.chatSession.update({
                where: { id: activeSession.id },
                data: { title: firstUserMessage.slice(0, 50) },
              })
            }
          }

          // Delete OpenClaw session
          await client.request('sessions.delete', { key: sessionKey })
        } catch {
          // Gateway offline — still archive the DB session
        }
      }

      // Mark old session as inactive
      await prisma.chatSession.update({
        where: { id: activeSession.id },
        data: { isActive: false },
      })
    }

    // Create new active session
    const newSession = await prisma.chatSession.create({
      data: {
        userId: user.id,
        instanceId,
        agentId,
        sessionId: sessionKey,
        isActive: true,
      },
      include: { instance: { select: { name: true } } },
    })

    return NextResponse.json({
      session: {
        id: newSession.id,
        sessionId: newSession.sessionId,
        instanceId: newSession.instanceId,
        instanceName: newSession.instance.name,
        agentId: newSession.agentId,
        title: newSession.title,
        lastMessageAt: null,
        messageCount: 0,
        isActive: true,
        createdAt: newSession.createdAt.toISOString(),
      },
    })
  }),
)
