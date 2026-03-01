import { randomUUID } from 'crypto'
import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import type { ChatHistoryMessage, ChatHistoryResult } from '@/types/gateway'
import type { ChatToolCall, ChatContentBlock, ChatMessage } from '@/types/chat'
import type { GatewayClient } from '@/lib/gateway/client'

// ─── Extraction helpers (shared across snapshot + liveMessages) ──────

export function extractText(content: ChatHistoryMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && block.text) parts.push(block.text)
  }
  return parts.join('\n').trim()
}

export function extractThinking(content: ChatHistoryMessage['content']): string {
  if (typeof content === 'string') return ''
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'thinking' && block.thinking) parts.push(block.thinking)
  }
  return parts.join('\n').trim()
}

export function extractContentBlocks(content: ChatHistoryMessage['content']): ChatContentBlock[] | undefined {
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

/**
 * Strip OpenClaw delivery metadata from stored user messages.
 * OpenClaw prepends "Conversation info ... [timestamp]" to user messages.
 */
export function stripUserMetadata(text: string): string {
  const match = text.match(/\[[\w\s:+\-]+UTC\]\s*/)
  if (match && match.index !== undefined) {
    const after = text.slice(match.index + match[0].length)
    if (after) return after
  }
  return text
}

/** Strip <final>...</final> wrapping from stored assistant messages. */
export function stripFinalTags(text: string): string {
  return text.replace(/<final>([\s\S]*?)<\/final>/g, '$1').trim()
}

/**
 * Fallback: extract response text embedded in thinking blocks.
 * Handles MiniMax <think> tag leaks and ZWJ separator patterns.
 */
export function splitThinkingFallback(thinking: string): { thinking: string; text: string } {
  const thinkMatch = thinking.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/)
  if (thinkMatch) {
    const extractedThinking = thinkMatch[1].trim()
    const extractedText = thinkMatch[2].trim()
    if (extractedText.length >= 2) {
      return { thinking: extractedThinking, text: extractedText }
    }
  }

  const zwjIndex = thinking.lastIndexOf('\u200D')
  if (zwjIndex !== -1) {
    const before = thinking.slice(0, zwjIndex).trim()
    const after = thinking.slice(zwjIndex + 1).trim()
    if (after.length >= 2) {
      return { thinking: before, text: after }
    }
  }

  return { thinking: '', text: thinking }
}

// ─── Snapshot building ───────────────────────────────────────────────

/**
 * Build ChatMessageSnapshot data from gateway chat.history messages.
 * Returns structured data ready for prisma.createMany and the first user message for auto-title.
 */
export function buildSnapshotData(
  chatSessionId: string,
  rawMessages: ChatHistoryMessage[],
): { snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[]; firstUserMessage: string | null } {
  const batchId = randomUUID()
  let orderIndex = 0
  const snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[] = []
  let firstUserMessage: string | null = null

  for (const msg of rawMessages) {
    if (msg.role === 'user') {
      const text = stripUserMetadata(extractText(msg.content))
      const cb = extractContentBlocks(msg.content)
      if (!firstUserMessage && text) firstUserMessage = text
      snapshotData.push({
        chatSessionId,
        batchId,
        orderIndex: orderIndex++,
        role: 'user',
        content: text,
        contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
      })
    } else if (msg.role === 'assistant') {
      let text = stripFinalTags(extractText(msg.content))
      let thinking = extractThinking(msg.content)
      const cb = extractContentBlocks(msg.content)
      const toolCalls: ChatToolCall[] = []

      if (!text && thinking) {
        const split = splitThinkingFallback(thinking)
        if (split.text) {
          text = split.text
          thinking = split.thinking
        }
      }

      snapshotData.push({
        chatSessionId,
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

  return { snapshotData, firstUserMessage }
}

// ─── Full archive flow ──────────────────────────────────────────────

/**
 * Archive a session: fetch chat.history → create snapshots → delete OpenClaw session → mark inactive.
 * Used by clear-context, conversations/new, and switchActiveSession.
 */
export async function archiveSession(
  sessionId: string,
  instanceId: string,
  agentId: string,
  userId: string,
  client: GatewayClient,
  opts?: { keepActive?: boolean },
): Promise<void> {
  const sessionKey = `agent:${agentId}:tc:${userId}`

  try {
    const rawResult = await client.request('chat.history', { sessionKey, limit: 200 })
    const historyResult = rawResult as ChatHistoryResult
    const rawMessages = historyResult.messages ?? []

    if (rawMessages.length > 0) {
      const { snapshotData, firstUserMessage } = buildSnapshotData(sessionId, rawMessages)

      if (snapshotData.length > 0) {
        await prisma.chatMessageSnapshot.createMany({ data: snapshotData })
      }

      // Auto-generate title from first user message
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { title: true },
      })
      if (!session?.title && firstUserMessage) {
        await prisma.chatSession.update({
          where: { id: sessionId },
          data: { title: firstUserMessage.slice(0, 50) },
        })
      }
    }

    // Delete OpenClaw session to reset context
    await client.request('sessions.delete', { key: sessionKey })
  } catch {
    // Gateway offline — continue with DB operations
  }

  if (!opts?.keepActive) {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { isActive: false, liveMessages: Prisma.DbNull },
    })
  }
}

// ─── Live messages (post-run auto-snapshot) ─────────────────────────

/**
 * Transform gateway raw messages to frontend ChatMessage[] format for liveMessages storage.
 * Similar to the history route's transformMessages but without file system image loading.
 */
export function transformToLiveMessages(rawMessages: ChatHistoryMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []

  for (const msg of rawMessages) {
    if (msg.role === 'user') {
      const contentBlocks = extractContentBlocks(msg.content)
      result.push({
        id: randomUUID(),
        role: 'user',
        content: stripUserMetadata(extractText(msg.content)),
        ...(contentBlocks ? { contentBlocks } : {}),
        createdAt: new Date().toISOString(),
      })
    } else if (msg.role === 'assistant') {
      let text = stripFinalTags(extractText(msg.content))
      let thinking = extractThinking(msg.content)
      const contentBlocks = extractContentBlocks(msg.content)

      if (!text && thinking) {
        const split = splitThinkingFallback(thinking)
        if (split.text) {
          text = split.text
          thinking = split.thinking
        }
      }

      result.push({
        id: randomUUID(),
        role: 'assistant',
        content: text,
        ...(contentBlocks ? { contentBlocks } : {}),
        ...(thinking ? { thinking } : {}),
        createdAt: new Date().toISOString(),
      })
    } else if (msg.role === 'toolResult') {
      const last = result[result.length - 1]
      if (last?.role === 'assistant') {
        const tc: ChatToolCall = {
          toolName: msg.toolName ?? 'tool',
          toolInput: null,
          toolOutput: extractText(msg.content),
        }
        last.toolCalls = [...(last.toolCalls ?? []), tc]
      }
    }
  }

  // Reclassify: assistant messages with tool calls are intermediate narration
  for (const msg of result) {
    if (msg.role === 'assistant' && msg.toolCalls?.length && msg.content) {
      msg.thinking = msg.content + (msg.thinking ? '\n\n' + msg.thinking : '')
      msg.content = ''
    }
  }

  return result
}

/**
 * Save liveMessages snapshot after a chat run completes.
 * Fire-and-forget: caller should .catch() errors.
 */
export async function saveLiveSnapshot(
  chatSessionId: string,
  client: GatewayClient,
  sessionKey: string,
): Promise<void> {
  const rawResult = await client.request('chat.history', { sessionKey, limit: 200 }, 10_000)
  const historyResult = rawResult as ChatHistoryResult
  const rawMessages = historyResult.messages ?? []
  if (rawMessages.length === 0) return

  const liveMessages = transformToLiveMessages(rawMessages)

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: { liveMessages: liveMessages as unknown as Prisma.InputJsonValue },
  })
}

/**
 * Persist liveMessages as permanent ChatMessageSnapshot rows.
 * Used when recovering from a stale session (SIGUSR1 restart).
 */
export async function persistLiveAsSnapshot(
  sessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  const batchId = randomUUID()
  const data = messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map((msg, i) => ({
      chatSessionId: sessionId,
      batchId,
      orderIndex: i,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking ?? null,
      toolCalls: msg.toolCalls ? (msg.toolCalls as unknown as Prisma.InputJsonValue) : undefined,
      contentBlocks: msg.contentBlocks ? (msg.contentBlocks as unknown as Prisma.InputJsonValue) : undefined,
    }))
  if (data.length > 0) {
    await prisma.chatMessageSnapshot.createMany({ data })
  }
}
