import { extname } from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { Prisma } from '@/generated/prisma'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import {
  extractText,
  extractThinking,
  extractContentBlocks,
  stripUserMetadata,
  stripFinalTags,
  splitThinkingFallback,
  persistLiveAsSnapshot,
} from '@/lib/chat/snapshot-helpers'
import { MIME_BY_EXT, extractMediaPaths, extractFileProtocolPaths, readImageAsDataUrl } from '@/lib/chat/image-helpers'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type { ChatMessage, ChatToolCall, ChatSnapshotBatch, ChatHistoryResponse, ChatContentBlock } from '@/types/chat'

/**
 * Strip MEDIA:/Image saved:/file:/// references from assistant text.
 * These paths are only meaningful on the server — the actual images
 * are extracted separately and delivered as contentBlocks.
 */
function stripMediaReferences(text: string): string {
  return text
    .replace(/\n*MEDIA:\s*\S+/gi, '')
    .replace(/\n*Image saved:\s*\S+/gi, '')
    .replace(/!\[[^\]]*\]\(file:\/\/\/[^)]+\)/gi, '')
    .replace(/file:\/\/\/\S+?\.(?:png|jpg|jpeg|gif|webp|bmp)(?=[)\s\]"]|$)/gi, '')
    .trim()
}

/**
 * Collect all MEDIA: paths from tool results in the message list.
 * Used to batch-load images after initial message parsing.
 */
interface PendingImage { messageIndex: number; path: string }

function transformMessages(raw: ChatHistoryMessage[]): { messages: ChatMessage[]; pendingImages: PendingImage[] } {
  const result: ChatMessage[] = []
  const pendingImages: PendingImage[] = []

  for (const msg of raw) {
    if (msg.role === 'user') {
      const contentBlocks = extractContentBlocks(msg.content)
      result.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: stripUserMetadata(extractText(msg.content)),
        ...(contentBlocks ? { contentBlocks } : {}),
        createdAt: new Date().toISOString(),
      })
    } else if (msg.role === 'assistant') {
      const rawText = extractText(msg.content)
      let text = stripFinalTags(stripMediaReferences(rawText))
      let thinking = extractThinking(msg.content)
      const contentBlocks = extractContentBlocks(msg.content)

      // Fallback: if model embedded response in thinking block (no text block)
      if (!text && thinking) {
        const split = splitThinkingFallback(thinking)
        if (split.text) {
          text = split.text
          thinking = split.thinking
        }
      }

      result.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: text,
        ...(contentBlocks ? { contentBlocks } : {}),
        ...(thinking ? { thinking } : {}),
        createdAt: new Date().toISOString(),
      })

      // Check for file:/// image paths in assistant text (use rawText before stripping)
      const filePaths = extractFileProtocolPaths(rawText)
      for (const p of filePaths) {
        pendingImages.push({ messageIndex: result.length - 1, path: p })
      }
    } else if (msg.role === 'toolResult') {
      const last = result[result.length - 1]
      if (last?.role === 'assistant') {
        const outputText = extractText(msg.content)
        const tc: ChatToolCall = {
          toolName: msg.toolName ?? 'tool',
          toolInput: null,
          toolOutput: outputText,
        }
        last.toolCalls = [...(last.toolCalls ?? []), tc]

        // Check for image paths in tool result
        const mediaPaths = extractMediaPaths(outputText)
        for (const p of mediaPaths) {
          pendingImages.push({ messageIndex: result.length - 1, path: p })
        }
      }
    }
  }

  // Post-process: assistant messages that have tool calls are intermediate
  // process narration (e.g. "Let me calculate that"), not final answers.
  // Move their text content into the thinking field so it renders in the
  // collapsible thinking block instead of as prominent chat text.
  for (const msg of result) {
    if (msg.role === 'assistant' && msg.toolCalls?.length && msg.content) {
      msg.thinking = msg.content + (msg.thinking ? '\n\n' + msg.thinking : '')
      msg.content = ''
    }
  }

  return { messages: result, pendingImages }
}

// GET /api/v1/chat/sessions/[id]/history — load snapshots + current messages
export const GET = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: 'No access to this session' }, { status: 403 })
    }

    // 1. Load snapshot messages from DB
    const snapshotRows = await prisma.chatMessageSnapshot.findMany({
      where: { chatSessionId: id },
      orderBy: [{ createdAt: 'asc' }, { orderIndex: 'asc' }],
    })

    // 2. Group by batchId
    const batchMap = new Map<string, { createdAt: string; messages: ChatMessage[] }>()
    for (const row of snapshotRows) {
      if (!batchMap.has(row.batchId)) {
        batchMap.set(row.batchId, {
          createdAt: row.createdAt.toISOString(),
          messages: [],
        })
      }
      const batch = batchMap.get(row.batchId)!
      batch.messages.push({
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        ...(row.contentBlocks ? { contentBlocks: row.contentBlocks as unknown as ChatContentBlock[] } : {}),
        ...(row.thinking ? { thinking: row.thinking } : {}),
        ...(row.toolCalls ? { toolCalls: row.toolCalls as unknown as ChatToolCall[] } : {}),
        createdAt: row.createdAt.toISOString(),
      })
    }

    const snapshots: ChatSnapshotBatch[] = Array.from(batchMap.entries()).map(
      ([batchId, data]) => ({
        batchId,
        createdAt: data.createdAt,
        messages: data.messages,
      }),
    )

    // 3. If session is active, load current messages from OpenClaw
    let currentMessages: ChatMessage[] = []
    let connectionStatus: 'ok' | 'unreachable' = 'ok'
    let sessionIsActive = session.isActive

    if (session.isActive) {
      try {
        await ensureRegistryInitialized()
        const client = registry.getClient(session.instanceId)
        if (client) {
          const sessionKey = `agent:${session.agentId}:tc:${session.userId}`
          const rawResult = await client.request('chat.history', { sessionKey, limit: 200 }, 10_000)
          const historyResult = rawResult as ChatHistoryResult
          const { messages: msgs, pendingImages } = transformMessages(historyResult.messages ?? [])

          // Load image files referenced in tool results
          if (pendingImages.length > 0) {
            const loaded = await Promise.all(
              pendingImages.map(async ({ messageIndex, path: p }) => ({
                messageIndex,
                dataUrl: await readImageAsDataUrl(p),
                mimeType: MIME_BY_EXT[extname(p).toLowerCase()] || 'image/png',
              })),
            )
            for (const { messageIndex, dataUrl, mimeType } of loaded) {
              if (!dataUrl) continue
              const msg = msgs[messageIndex]
              if (msg?.role === 'assistant') {
                const blocks: ChatContentBlock[] = [...(msg.contentBlocks ?? [])]
                blocks.push({ type: 'image', imageUrl: dataUrl, mimeType })
                msg.contentBlocks = blocks
              }
            }
          }

          currentMessages = msgs
        }

        // Stale session detection: gateway responded but session was destroyed (SIGUSR1 restart).
        // Skip for very recently created sessions — the gateway may not have received the
        // first chat.send yet (race: SSE session event arrives before gateway processes message).
        const sessionAgeMs = Date.now() - session.createdAt.getTime()
        if (currentMessages.length === 0 && sessionAgeMs > 30_000) {
          if (session.liveMessages) {
            // Recover messages from liveMessages auto-snapshot
            snapshots.push({
              batchId: `recovered-${id}`,
              createdAt: session.updatedAt.toISOString(),
              messages: session.liveMessages as unknown as ChatMessage[],
            })
            // Persist as permanent snapshot (fire-and-forget)
            persistLiveAsSnapshot(id, session.liveMessages as unknown as ChatMessage[]).catch(() => {})
          }
          // Mark session inactive + clear liveMessages
          await prisma.chatSession.update({
            where: { id },
            data: { isActive: false, liveMessages: Prisma.DbNull },
          }).catch(() => {})
          sessionIsActive = false
        }
      } catch {
        // Gateway unreachable / timeout — show warning, keep session active for retry
        connectionStatus = 'unreachable'
      }
    }

    const response: ChatHistoryResponse = {
      snapshots,
      currentMessages,
      isActive: sessionIsActive,
      ...(connectionStatus !== 'ok' ? { connectionStatus } : {}),
    }

    return NextResponse.json(response)
  }),
)
