import { randomUUID } from 'crypto'
import { extname } from 'path'
import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import {
  extractMediaPaths,
  readImageAsDataUrl,
  readContainerImageAsDataUrl,
  stampImageIds,
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

/**
 * Merge image contentBlocks from liveMessages into snapshot data rows.
 * Matches by index + role: snapshotData and liveMessages share the same
 * message ordering (both derived from gateway chat.history).
 */
function mergeContentBlocksIntoSnapshots(
  snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[],
  liveMessages: ChatMessage[],
): void {
  // Build a lookup: liveMessages index → contentBlocks (images only)
  // liveMessages may have fewer entries (user+assistant only, no toolResult rows)
  let liveIdx = 0
  for (const snap of snapshotData) {
    if (liveIdx >= liveMessages.length) break
    const live = liveMessages[liveIdx]
    if (snap.role !== live.role) continue
    liveIdx++

    if (snap.role !== 'assistant') continue
    if (snap.contentBlocks) continue // already has content blocks
    const imageBlocks = live.contentBlocks?.filter(b => b.type === 'image')
    if (imageBlocks?.length) {
      snap.contentBlocks = imageBlocks as unknown as Prisma.InputJsonValue
    }
  }
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

  // Load liveMessages before archiving — they contain image contentBlocks
  // that chat.history doesn't return (images are captured during SSE streaming
  // and stored in liveMessages, but chat.history strips inline image blocks).
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { liveMessages: true },
  })
  const liveMessages = Array.isArray(session?.liveMessages)
    ? (session.liveMessages as unknown as ChatMessage[])
    : null

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

    // Merge image contentBlocks from liveMessages into snapshot data.
    // chat.history strips image blocks, but liveMessages captured them
    // during SSE streaming. Without this merge, images are lost on archive.
    if (liveMessages && liveMessages.length > 0 && snapshotData.length > 0) {
      mergeContentBlocksIntoSnapshots(snapshotData, liveMessages)
    }

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
  } else if (liveMessages && liveMessages.length > 0) {
    // Gateway offline but we have liveMessages — persist them as snapshots
    // so messages (including images) aren't lost.
    await persistLiveAsSnapshot(sessionId, liveMessages)
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
 * Resolve MEDIA paths in tool outputs per-message.
 * Each assistant message with toolCalls gets its OWN images from its own MEDIA paths.
 * This prevents cross-exchange contamination (images from exchange 1 leaking to exchange 2).
 * Skips messages that already have image contentBlocks.
 */
async function resolveMediaPerMessage(
  messages: ChatMessage[],
  containerId: string | null,
): Promise<void> {
  const readImage = containerId
    ? (p: string) => readContainerImageAsDataUrl(containerId, p)
    : readImageAsDataUrl

  for (const msg of messages) {
    if (msg.role !== 'assistant') continue
    if (msg.contentBlocks?.some(b => b.type === 'image')) continue
    if (!msg.toolCalls?.length) continue

    const allPaths: string[] = []
    for (const tc of msg.toolCalls) {
      const output = typeof tc.toolOutput === 'string' ? tc.toolOutput : ''
      if (output) allPaths.push(...extractMediaPaths(output))
    }

    if (allPaths.length === 0) continue

    const uniquePaths = [...new Set(allPaths)]
    const blocks: ChatContentBlock[] = [...(msg.contentBlocks ?? [])]

    await Promise.all(
      uniquePaths.map(async (p) => {
        const dataUrl = await readImage(p)
        if (dataUrl) {
          const ext = extname(p).toLowerCase()
          blocks.push({ type: 'image', imageUrl: dataUrl, mimeType: MIME_BY_EXT[ext] })
        }
      }),
    )

    if (blocks.length > (msg.contentBlocks?.length ?? 0)) {
      msg.contentBlocks = blocks
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

  // Image capture (two complementary mechanisms, both always run):
  //
  // 1. Per-message MEDIA resolution: scan each assistant message's toolCalls for
  //    MEDIA paths and read files. Images are added to the message that produced them.
  //    This is the primary mechanism — robust even when fetchAndEmitImages fails.
  await resolveMediaPerMessage(liveMessages, containerId ?? null).catch(() => {})

  // 2. SSE-captured images: fetchAndEmitImages reads files during the SSE stream.
  //    Add to last assistant message with global dedup (skip if already on any message).
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

  // Pre-compute imageId on all image blocks so the image endpoint
  // can look up by field match instead of re-hashing on every request.
  stampImageIds(liveMessages)

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
 * Uses global dedup: skips images that already exist on ANY message
 * (e.g., already resolved by resolveMediaPerMessage on an intermediate message).
 */
function mergeCapturedImages(
  messages: ChatMessage[],
  images: { imageUrl: string; mimeType?: string }[],
): void {
  // Collect all image URLs already present on any message (global dedup)
  const globalUrls = new Set<string>()
  for (const msg of messages) {
    if (msg.contentBlocks) {
      for (const b of msg.contentBlocks) {
        if (b.type === 'image' && b.imageUrl) globalUrls.add(b.imageUrl)
      }
    }
  }

  // Find the last assistant message and add only new images
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const existing = messages[i].contentBlocks ?? []
      for (const img of images) {
        if (!globalUrls.has(img.imageUrl)) {
          existing.push({ type: 'image', imageUrl: img.imageUrl, mimeType: img.mimeType })
          globalUrls.add(img.imageUrl) // prevent duplicate from same batch
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
export function mergeExistingContentBlocks(
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
  // Ensure imageIds are stamped before persisting to snapshots
  stampImageIds(messages)
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
