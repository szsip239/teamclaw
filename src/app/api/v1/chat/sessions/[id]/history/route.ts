import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import {
  extractText,
  extractThinking,
  extractContentBlocks,
  stripUserMetadata,
  stripFinalTags,
  splitThinkingFallback,
  mergeExistingContentBlocks,
  mergeLiveMessagesAppendOnly,
  mergeToolInputs,
  shouldUseLiveMessagesFallback,
} from '@/lib/chat/snapshot-helpers'
import { computeImageId } from '@/lib/chat/image-helpers'
import { stripRagContextForDisplay } from '@/lib/chat/rag-user-message'
import { activeRuns } from '@/lib/chat/active-runs'
import { imageBlockDisplayKey, imageIdFromHistoryUrl } from '@/lib/chat/image-blocks'
import { parseSessionMessage } from '@/lib/chat/session-message'
import { sanitizeOutputArtifactLinks } from '@/lib/session-files/artifacts'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type {
  ChatMessage,
  ChatToolCall,
  ChatSnapshotBatch,
  ChatHistoryResponse,
  ChatContentBlock,
} from '@/types/chat'

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

function hasValue(value: unknown): boolean {
  return value != null && value !== ''
}

function completeToolCall(
  toolCalls: ChatToolCall[] | undefined,
  result: ChatToolCall,
): ChatToolCall[] {
  const next = [...(toolCalls ?? [])]
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i].toolName !== result.toolName) continue
    if (next[i].toolOutput != null) continue
    next[i] = {
      ...next[i],
      toolInput: hasValue(next[i].toolInput) ? next[i].toolInput : result.toolInput,
      toolOutput: result.toolOutput,
    }
    return next
  }
  next.push(result)
  return next
}

function transformMessages(raw: ChatHistoryMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  // Use index-based IDs so the same message gets the same ID across polls.
  // Random UUIDs would change every poll → React key changes → component
  // unmount/remount → collapsible sections (thinking, tools) lose their
  // expanded state.
  let orderIndex = 0

  for (const msg of raw) {
    if (msg.role === 'user') {
      const contentBlocks = extractContentBlocks(msg.content)
      const id = `current-${orderIndex}`
      result.push({
        id,
        role: 'user',
        content: stripRagContextForDisplay(stripUserMetadata(extractText(msg.content))),
        ...(contentBlocks ? { contentBlocks } : {}),
        createdAt: new Date().toISOString(),
      })
      orderIndex++
    } else if (msg.role === 'assistant') {
      const id = `current-${orderIndex}`
      const parsed = parseSessionMessage({
        messageId: id,
        messageSeq: orderIndex,
        message: msg,
      })
      const rawText = extractText(msg.content) || parsed.text
      let text = sanitizeOutputArtifactLinks(stripFinalTags(stripMediaReferences(rawText)))
      let thinking = parsed.thinking ?? extractThinking(msg.content)
      const contentBlocks = extractContentBlocks(msg.content)

      if (!text && thinking) {
        const split = splitThinkingFallback(thinking)
        if (split.text) {
          text = split.text
          thinking = split.thinking
        }
      }

      result.push({
        id,
        role: 'assistant',
        content: text,
        ...(contentBlocks ? { contentBlocks } : {}),
        ...(thinking ? { thinking } : {}),
        ...(parsed.toolCalls ? { toolCalls: parsed.toolCalls } : {}),
        ...(parsed.stopReason
          ? {
              messageSeq: parsed.messageSeq,
              stopReason: parsed.stopReason,
              isFinal: parsed.isFinal,
            }
          : {}),
        createdAt: new Date().toISOString(),
      })
      orderIndex++
    } else if (msg.role === 'toolResult') {
      const last = result[result.length - 1]
      if (last?.role === 'assistant') {
        const outputText = extractText(msg.content)
        const tc: ChatToolCall = {
          toolName: msg.toolName ?? 'tool',
          toolInput: null,
          toolOutput: outputText,
        }
        last.toolCalls = completeToolCall(last.toolCalls, tc)
      }
    }
  }

  // Post-process: assistant messages that have tool calls are intermediate
  // process narration (e.g. "Let me calculate that"), not final answers.
  // Move their text content into the thinking field so it renders in the
  // collapsible thinking block instead of as prominent chat text.
  for (const msg of result) {
    if (msg.role === 'assistant' && msg.stopReason == null && msg.toolCalls?.length && msg.content) {
      msg.thinking = msg.content + (msg.thinking ? '\n\n' + msg.thinking : '')
      msg.content = ''
    }
  }

  return result
}

/**
 * Replace inline base64 image data URLs with lightweight API references.
 * Mutates messages in-place for efficiency.
 */
function replaceInlineImages(messages: ChatMessage[], sessionId: string): void {
  for (const msg of messages) {
    if (!msg.contentBlocks) continue
    for (const block of msg.contentBlocks) {
      if (block.type === 'image' && block.imageUrl?.startsWith('data:')) {
        const hash = computeImageId(block.imageUrl)
        block.imageId = hash
        block.imageUrl = `/api/v1/chat/sessions/${sessionId}/images/${hash}`
      } else if (block.type === 'image' && block.imageUrl && !block.imageId) {
        const hash = imageIdFromHistoryUrl(block.imageUrl)
        if (hash) block.imageId = hash
      }
    }
    msg.contentBlocks = dedupeContentBlocks(msg.contentBlocks)
  }
}

function dedupeContentBlocks(blocks: ChatContentBlock[]): ChatContentBlock[] {
  const seen = new Set<string>()
  const unique: ChatContentBlock[] = []

  for (const block of blocks) {
    const key = imageBlockDisplayKey(block)
    if (seen.has(key)) continue
    unique.push(block)
    seen.add(key)
  }

  return unique
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
        content: sanitizeOutputArtifactLinks(row.content),
        ...(row.contentBlocks
          ? { contentBlocks: row.contentBlocks as unknown as ChatContentBlock[] }
          : {}),
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
    let connectionStatus: 'ok' | 'unreachable' | 'session-lost' = 'ok'
    const sessionIsActive = session.isActive

    if (session.isActive) {
      try {
        await ensureRegistryInitialized()
        const client = registry.getClient(session.instanceId)
        if (client) {
          const sessionKey = `agent:${session.agentId}:tc:${session.userId}`
          const rawResult = await client.request(
            'chat.history',
            { sessionKey, limit: 1000 },
            10_000,
          )
          const historyResult = rawResult as ChatHistoryResult
          const msgs = transformMessages(historyResult.messages ?? [])
          let cachedLive: ChatMessage[] | null = null

          // Merge image contentBlocks from liveMessages (captured during SSE streaming).
          // chat.history doesn't return inline image blocks, so liveMessages is
          // the primary source of image data for page refreshes.
          if (session.liveMessages) {
            const cached = session.liveMessages as unknown as ChatMessage[]
            if (Array.isArray(cached)) {
              cachedLive = cached
            }
          }

          const sameGatewaySession =
            !session.gwSessionId ||
            !historyResult.sessionId ||
            session.gwSessionId === historyResult.sessionId

          if (
            cachedLive &&
            shouldUseLiveMessagesFallback(msgs, cachedLive, sameGatewaySession)
          ) {
            currentMessages = mergeLiveMessagesAppendOnly(cachedLive, msgs)
          } else {
            if (cachedLive) {
              mergeExistingContentBlocks(msgs, cachedLive)
              mergeToolInputs(msgs, cachedLive)
            }
            currentMessages = msgs
          }

          // Stale session detection: gateway responded but session was destroyed (SIGUSR1 restart).
          // Don't auto-archive — let the user decide whether to retry or start a new conversation.
          // The session stays active so the user can simply send a new message to continue.
          const isPolling = new URL(_req.url).searchParams.get('polling') === 'true'
          const sessionAgeMs = Date.now() - session.createdAt.getTime()
          if (
            !isPolling &&
            !activeRuns.has(id) &&
            currentMessages.length === 0 &&
            sessionAgeMs > 30_000 &&
            session.messageCount > 0
          ) {
            connectionStatus = 'session-lost'
            if (session.liveMessages) {
              const cached = session.liveMessages as unknown as ChatMessage[]
              if (Array.isArray(cached)) {
                currentMessages = cached
              }
            }
          }
        } else {
          // Client not available (instance not yet reconnected after restart).
          // Fall back to liveMessages for display without archiving the session.
          connectionStatus = 'unreachable'
          if (session.liveMessages) {
            const cached = session.liveMessages as unknown as ChatMessage[]
            if (Array.isArray(cached)) {
              currentMessages = cached
            }
          }
        }
      } catch {
        // Gateway unreachable / timeout — show warning, keep session active for retry.
        // Fall back to liveMessages so the user still sees their conversation.
        connectionStatus = 'unreachable'
        if (session.liveMessages) {
          const cached = session.liveMessages as unknown as ChatMessage[]
          if (Array.isArray(cached)) {
            currentMessages = cached
          }
        }
      }
    }

    // Deduplicate: if sessions.delete failed during clear-context,
    // the gateway still has old messages that were already snapshotted.
    // Detect and trim the overlapping prefix from currentMessages.
    if (snapshots.length > 0 && currentMessages.length > 0) {
      const lastBatch = snapshots[snapshots.length - 1].messages
      let overlap = 0
      for (let i = 0; i < Math.min(lastBatch.length, currentMessages.length); i++) {
        if (
          lastBatch[i].role === currentMessages[i].role &&
          lastBatch[i].content === currentMessages[i].content
        ) {
          overlap++
        } else {
          break
        }
      }
      if (overlap === lastBatch.length && overlap > 0) {
        currentMessages = currentMessages.slice(overlap)
      }
    }

    replaceInlineImages(currentMessages, id)
    for (const batch of snapshots) {
      replaceInlineImages(batch.messages, id)
    }

    const response: ChatHistoryResponse = {
      snapshots,
      currentMessages,
      isActive: sessionIsActive,
      ...(connectionStatus !== 'ok' ? { connectionStatus } : {}),
      ...(activeRuns.has(id) ? { isRunning: true } : {}),
    }

    return NextResponse.json(response)
  }),
)
