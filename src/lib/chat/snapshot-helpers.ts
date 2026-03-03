import { randomUUID } from 'crypto'
import { extname } from 'path'
import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import {
  extractMediaPaths,
  extractFileProtocolPaths,
  readImageAsDataUrl,
  readContainerImageAsDataUrl,
  MIME_BY_EXT,
} from '@/lib/chat/image-helpers'
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
 * Timestamp formats vary: [Mon 2026-03-02 11:50 UTC], [2026-03-02 11:50+0800], etc.
 */
export function stripUserMetadata(text: string): string {
  // Use the LAST timestamp match — tool results and system lines can also
  // contain [YYYY-MM-DD HH:MM ...] brackets before the actual metadata timestamp.
  const matches = [...text.matchAll(/\[[^\]]*\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}[^\]]*\]\s*/g)]
  if (matches.length > 0) {
    const last = matches[matches.length - 1]
    const after = text.slice(last.index! + last[0].length)
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

  // No separator found — keep as thinking rather than exposing as visible text.
  // This is safer: the user can expand the thinking block to read it.
  return { thinking, text: '' }
}

// ─── Snapshot building ───────────────────────────────────────────────

/**
 * Build ChatMessageSnapshot data from gateway chat.history messages.
 * Returns structured data ready for prisma.createMany and the last user message for auto-title.
 */
export function buildSnapshotData(
  chatSessionId: string,
  rawMessages: ChatHistoryMessage[],
): { snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[]; lastUserMessage: string | null } {
  const batchId = randomUUID()
  let orderIndex = 0
  const snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[] = []
  let lastUserMessage: string | null = null

  for (const msg of rawMessages) {
    if (msg.role === 'user') {
      const text = stripUserMetadata(extractText(msg.content))
      const cb = extractContentBlocks(msg.content)
      if (text) lastUserMessage = text
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
        // toolCalls populated later by toolResult handler below
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

  return { snapshotData, lastUserMessage }
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

  // Fetch history from gateway (may fail if gateway is offline)
  let rawMessages: ChatHistoryMessage[] = []
  try {
    const rawResult = await client.request('chat.history', { sessionKey, limit: 200 })
    const historyResult = rawResult as ChatHistoryResult
    rawMessages = historyResult.messages ?? []
  } catch {
    // Gateway offline — continue with DB operations
  }

  // Save snapshots to DB (errors propagate to caller — don't silently lose data)
  if (rawMessages.length > 0) {
    const { snapshotData, lastUserMessage } = buildSnapshotData(sessionId, rawMessages)

    if (snapshotData.length > 0) {
      await prisma.chatMessageSnapshot.createMany({ data: snapshotData })
    }

    // Auto-title: always update to the last user message so the title
    // reflects the most recent topic of the conversation.
    if (lastUserMessage) {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title: lastUserMessage.slice(0, 50) },
      })
    }
  }

  // Delete OpenClaw session to reset context
  try {
    await client.request('sessions.delete', { key: sessionKey })
  } catch {
    // Gateway offline — session will be cleaned up on next connect
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
 * Resolve MEDIA:/file:/// paths in tool outputs and assistant text to
 * data URL contentBlocks. Mutates messages in place.
 *
 * This ensures images generated by tools (e.g. nano-banana-pro, feishu-ask)
 * are persisted in liveMessages so they survive page refreshes.
 */
export async function resolveMediaInMessages(
  messages: ChatMessage[],
  containerId: string | null,
): Promise<void> {
  const readImage = containerId
    ? (p: string) => readContainerImageAsDataUrl(containerId, p)
    : readImageAsDataUrl

  const pending: { msg: ChatMessage; path: string }[] = []

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue

    // Check tool outputs for MEDIA: paths
    if (msg.toolCalls?.length) {
      for (const tc of msg.toolCalls) {
        const output = typeof tc.toolOutput === 'string' ? tc.toolOutput : ''
        if (!output) continue
        for (const p of extractMediaPaths(output)) {
          pending.push({ msg, path: p })
        }
      }
    }

    // Check assistant text/thinking for file:/// paths
    for (const text of [msg.content, msg.thinking]) {
      if (!text) continue
      for (const p of extractFileProtocolPaths(text)) {
        pending.push({ msg, path: p })
      }
      for (const p of extractMediaPaths(text)) {
        pending.push({ msg, path: p })
      }
    }
  }

  if (pending.length === 0) return

  // Deduplicate by path to avoid reading the same file multiple times
  const uniquePaths = [...new Set(pending.map(p => p.path))]
  const resolved = new Map<string, string>()
  await Promise.all(
    uniquePaths.map(async (p) => {
      const dataUrl = await readImage(p)
      if (dataUrl) resolved.set(p, dataUrl)
    }),
  )

  // Add resolved images to contentBlocks
  for (const { msg, path } of pending) {
    const dataUrl = resolved.get(path)
    if (!dataUrl) continue
    const ext = extname(path).toLowerCase()
    const block: ChatContentBlock = { type: 'image', imageUrl: dataUrl, mimeType: MIME_BY_EXT[ext] }
    // Avoid duplicates (same image might appear in multiple tool results)
    const existing = msg.contentBlocks ?? []
    if (!existing.some(b => b.type === 'image' && b.imageUrl === dataUrl)) {
      msg.contentBlocks = [...existing, block]
    }
  }
}

/**
 * Save liveMessages snapshot after a chat run completes.
 * Fire-and-forget: caller should .catch() errors.
 *
 * Safety: if the gateway returns fewer user messages than currently stored
 * in liveMessages, the gateway session was likely reset (SIGUSR1, reconnect, etc.).
 * In that case, archive the old messages to ChatMessageSnapshot first
 * to prevent data loss, then store the new (smaller) set as liveMessages.
 */
export async function saveLiveSnapshot(
  chatSessionId: string,
  client: GatewayClient,
  sessionKey: string,
  containerId?: string | null,
  capturedImages?: { imageUrl: string; mimeType?: string }[],
): Promise<void> {
  const rawResult = await client.request('chat.history', { sessionKey, limit: 200 }, 10_000)
  const historyResult = rawResult as ChatHistoryResult
  const rawMessages = historyResult.messages ?? []
  if (rawMessages.length === 0) return

  const liveMessages = transformToLiveMessages(rawMessages)

  // Resolve MEDIA:/file:/// paths in tool outputs to data URL contentBlocks
  // so images persist across page refreshes and container rebuilds.
  await resolveMediaInMessages(liveMessages, containerId ?? null)

  // Merge images captured from SSE events into the last assistant message.
  // chat.history doesn't return inline image content blocks that the gateway
  // embeds during live streaming, so we must carry them from the SSE handler.
  if (capturedImages?.length) {
    mergeCapturedImages(liveMessages, capturedImages)
  }

  // Detect session reset via gateway session ID.
  // OpenClaw assigns an internal session ID (e.g. "16a0f62a") that changes
  // when the session is rebuilt (SIGUSR1, reconnect, etc.). If it changes,
  // archive the old liveMessages before overwriting.
  const gwSessionId = historyResult.sessionId
  const session = await prisma.chatSession.findUnique({
    where: { id: chatSessionId },
    select: { gwSessionId: true, liveMessages: true },
  })
  const existingLive = (session?.liveMessages ?? []) as unknown as ChatMessage[]

  if (session?.gwSessionId && gwSessionId && session.gwSessionId !== gwSessionId) {
    if (Array.isArray(existingLive) && existingLive.length > 0) {
      console.warn(
        `[live-snapshot] Session reset detected for ${chatSessionId}: ` +
        `gwSessionId changed ${session.gwSessionId} → ${gwSessionId}. Archiving old messages.`,
      )
      await persistLiveAsSnapshot(chatSessionId, existingLive)
    }
  } else if (Array.isArray(existingLive)) {
    // Same session — carry forward contentBlocks from existing liveMessages.
    // Previous runs' images are already persisted; don't lose them when
    // saveLiveSnapshot overwrites with fresh (image-less) chat.history data.
    mergeExistingContentBlocks(liveMessages, existingLive)
  }

  await prisma.chatSession.update({
    where: { id: chatSessionId },
    data: {
      liveMessages: liveMessages as unknown as Prisma.InputJsonValue,
      gwSessionId: gwSessionId || undefined,
    },
  })
}

/**
 * Merge captured SSE images into the last assistant message's contentBlocks.
 * During live streaming, OpenClaw embeds image data in chat events, but
 * chat.history strips them. We capture during SSE and merge here.
 */
function mergeCapturedImages(
  messages: ChatMessage[],
  images: { imageUrl: string; mimeType?: string }[],
): void {
  // Find the last assistant message (the one produced by this run)
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const existing = messages[i].contentBlocks ?? []
      const existingUrls = new Set(existing.filter(b => b.type === 'image').map(b => b.imageUrl))
      for (const img of images) {
        if (!existingUrls.has(img.imageUrl)) {
          existing.push({ type: 'image', imageUrl: img.imageUrl, mimeType: img.mimeType })
        }
      }
      if (existing.length > 0) {
        messages[i].contentBlocks = existing
      }
      break
    }
  }
}

/**
 * Carry forward contentBlocks from previous liveMessages.
 * When saveLiveSnapshot overwrites with fresh chat.history data,
 * images from earlier runs would be lost without this merge.
 */
function mergeExistingContentBlocks(
  newMessages: ChatMessage[],
  oldMessages: ChatMessage[],
): void {
  // Match messages by index + role (chat.history order is stable)
  const limit = Math.min(newMessages.length, oldMessages.length)
  for (let i = 0; i < limit; i++) {
    const newMsg = newMessages[i]
    const oldMsg = oldMessages[i]
    if (newMsg.role !== oldMsg.role) continue
    if (newMsg.role !== 'assistant') continue
    if (!oldMsg.contentBlocks?.length) continue
    if (newMsg.contentBlocks?.length) continue // new data already has images

    // Carry over old contentBlocks
    newMsg.contentBlocks = oldMsg.contentBlocks
  }
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
