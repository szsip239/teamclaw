import { randomUUID } from 'crypto'
import { extname } from 'path'
import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import {
  computeImageId,
  extractMediaPaths,
  readImageAsDataUrl,
  readContainerImageAsDataUrl,
  stampImageIds,
  MIME_BY_EXT,
} from '@/lib/chat/image-helpers'
import { imageIdFromHistoryUrl } from '@/lib/chat/image-blocks'
import { stripRagContextForDisplay } from '@/lib/chat/rag-user-message'
import { parseSessionMessage } from '@/lib/chat/session-message'
import {
  sanitizeOutputArtifactLinks,
  stripOutputArtifactLinksToLabels,
} from '@/lib/session-files/artifacts'
import { buildChatRuntimeSessionKey, type ChatRuntime } from '@/lib/chat/runtime'
import type { ChatHistoryMessage, ChatHistoryResult } from '@/types/gateway'
import type { ChatToolCall, ChatContentBlock, ChatMessage } from '@/types/chat'
import type { GatewayClient } from '@/lib/gateway/client'

export const LIVE_HISTORY_LIMIT = 500
export const MAX_LIVE_MESSAGES = 800

const snapshotLocks = new Map<string, Promise<void>>()

async function withSessionSnapshotLock<T>(chatSessionId: string, fn: () => Promise<T>): Promise<T> {
  const previous = snapshotLocks.get(chatSessionId) ?? Promise.resolve()
  const run = previous.catch(() => {}).then(fn)
  const tracked = run.then(
    () => undefined,
    () => undefined,
  )
  snapshotLocks.set(chatSessionId, tracked)

  try {
    return await run
  } finally {
    if (snapshotLocks.get(chatSessionId) === tracked) {
      snapshotLocks.delete(chatSessionId)
    }
  }
}

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

export function extractContentBlocks(
  content: ChatHistoryMessage['content'],
): ChatContentBlock[] | undefined {
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
  return dedupeContentBlocks(blocks)
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
      const text = stripRagContextForDisplay(stripUserMetadata(extractText(msg.content)))
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
      const parsed = parseSessionMessage({
        messageId: String(orderIndex),
        messageSeq: orderIndex,
        message: msg,
      })
      let text = sanitizeOutputArtifactLinks(
        stripFinalTags(extractText(msg.content) || parsed.text),
      )
      let thinking = parsed.thinking ?? extractThinking(msg.content)
      const cb = extractContentBlocks(msg.content)

      if (!text && thinking) {
        const split = splitThinkingFallback(thinking)
        if (split.text) {
          text = split.text
          thinking = split.thinking
        }
      }
      if (parsed.stopReason && parsed.stopReason !== 'stop' && parsed.toolCalls?.length && text) {
        thinking = text + (thinking ? '\n\n' + thinking : '')
        text = ''
      }

      snapshotData.push({
        chatSessionId,
        batchId,
        orderIndex: orderIndex++,
        role: 'assistant',
        content: text,
        contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
        thinking: thinking || null,
        toolCalls: parsed.toolCalls
          ? (parsed.toolCalls as unknown as Prisma.InputJsonValue)
          : undefined,
      })
    } else if (msg.role === 'toolResult') {
      const lastSnapshot = snapshotData[snapshotData.length - 1]
      if (lastSnapshot?.role === 'assistant') {
        const existing = (lastSnapshot.toolCalls as unknown as ChatToolCall[] | null) ?? []
        lastSnapshot.toolCalls = completeToolCall(existing, {
          toolName: msg.toolName ?? 'tool',
          toolInput: null,
          toolOutput: extractText(msg.content),
        }) as unknown as Prisma.InputJsonValue
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

    if (snap.contentBlocks) continue // already has content blocks
    const imageBlocks = live.contentBlocks?.filter((b) => b.type === 'image')
    if (imageBlocks?.length) {
      snap.contentBlocks = imageBlocks as unknown as Prisma.InputJsonValue
    }
  }
}

function mergeLocalAssistantContentIntoSnapshots(
  snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[],
  liveMessages: ChatMessage[],
): void {
  let liveIdx = 0
  for (const snap of snapshotData) {
    if (liveIdx >= liveMessages.length) break
    const live = liveMessages[liveIdx]
    if (snap.role !== live.role) continue
    liveIdx++

    if (snap.role !== 'assistant') continue
    const snapContent = String(snap.content ?? '')
    if (!isLocalArtifactAugmentedContent(live.content, snapContent)) continue
    snap.content = live.content
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
  opts?: {
    keepActive?: boolean
    runtime?: ChatRuntime
    triggerMemoryDump?: boolean
    waitForNewCompletion?: boolean
  },
): Promise<void> {
  const sessionKey = buildChatRuntimeSessionKey(opts?.runtime ?? 'openclaw', agentId, userId)

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
    const rawResult = await client.request('chat.history', {
      sessionKey,
      limit: LIVE_HISTORY_LIMIT,
    })
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
      mergeLocalAssistantContentIntoSnapshots(snapshotData, liveMessages)
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

  // Reset gateway session
  if (opts?.triggerMemoryDump) {
    // Send /new to trigger OpenClaw's memory dump before session destruction.
    // OpenClaw saves conversation → memory/YYYY-MM-DD-*.md → destroys old session → creates new one.
    try {
      const newRunId = randomUUID()
      await client.request('chat.send', {
        sessionKey,
        message: '/new',
        idempotencyKey: newRunId,
      })

      if (opts.waitForNewCompletion) {
        // Wait for /new run to fully complete before returning.
        // Required when a follow-up message will be sent immediately (scenario 3: switchActiveSession),
        // because /new destroys and recreates the gateway session — messages sent during this
        // transition are silently dropped.
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            unsub()
            resolve()
          }, 30_000)
          const unsub = client.on('chat', (payload: unknown) => {
            const evt = payload as Record<string, unknown>
            if (evt?.runId !== newRunId) return
            const state = evt.state as string
            if (state === 'final' || state === 'error' || state === 'aborted') {
              clearTimeout(timeout)
              unsub()
              resolve()
            }
          })
        })
      }
    } catch {
      // /new failed — fall back to direct session delete (memory dump skipped)
      try {
        await client.request('sessions.delete', { key: sessionKey })
      } catch {
        /* offline */
      }
    }
  } else {
    try {
      await client.request('sessions.delete', { key: sessionKey })
    } catch {
      // Gateway offline — session will be cleaned up on next connect
    }
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
        content: stripRagContextForDisplay(stripUserMetadata(extractText(msg.content))),
        ...(contentBlocks ? { contentBlocks } : {}),
        createdAt: new Date().toISOString(),
      })
    } else if (msg.role === 'assistant') {
      const parsed = parseSessionMessage({
        messageId: randomUUID(),
        messageSeq: result.length,
        message: msg,
      })
      let text = stripFinalTags(extractText(msg.content) || parsed.text)
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
        id: randomUUID(),
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
    } else if (msg.role === 'toolResult') {
      const last = result[result.length - 1]
      if (last?.role === 'assistant') {
        const tc: ChatToolCall = {
          toolName: msg.toolName ?? 'tool',
          toolInput: null,
          toolOutput: extractText(msg.content),
        }
        last.toolCalls = completeToolCall(last.toolCalls, tc)
      }
    }
  }

  // Reclassify: assistant messages with tool calls are intermediate narration
  for (const msg of result) {
    if (
      msg.role === 'assistant' &&
      msg.stopReason == null &&
      msg.toolCalls?.length &&
      msg.content
    ) {
      msg.thinking = msg.content + (msg.thinking ? '\n\n' + msg.thinking : '')
      msg.content = ''
    }
  }

  return result
}

function cloneContentBlocks(
  blocks: ChatContentBlock[] | undefined,
): ChatContentBlock[] | undefined {
  return blocks?.map((block) => ({ ...block }))
}

function cloneToolCalls(toolCalls: ChatToolCall[] | undefined): ChatToolCall[] | undefined {
  return toolCalls?.map((toolCall) => ({ ...toolCall }))
}

function cloneMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    ...(message.contentBlocks ? { contentBlocks: cloneContentBlocks(message.contentBlocks) } : {}),
    ...(message.toolCalls ? { toolCalls: cloneToolCalls(message.toolCalls) } : {}),
    ...(message.attachments
      ? { attachments: message.attachments.map((attachment) => ({ ...attachment })) }
      : {}),
    ...(message.kbSources ? { kbSources: message.kbSources.map((source) => ({ ...source })) } : {}),
  }
}

function replaceLastAssistantMessageContent(
  messages: ChatMessage[],
  contentOverride: string | undefined,
): void {
  const content = contentOverride ? sanitizeOutputArtifactLinks(contentOverride).trimEnd() : ''
  if (!content) return

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'assistant') continue
    message.content = content
    return
  }
}

function containsOutputLink(content: string): boolean {
  return /\]\(output\/[^)]+\)|(?:^|\s)output\/[^\s)]+/.test(content)
}

function isLocalArtifactAugmentedContent(localContent: string, gatewayContent: string): boolean {
  if (localContent === gatewayContent) return false

  const gatewayBase = gatewayContent.trimEnd()
  if (gatewayBase && localContent.startsWith(gatewayBase)) {
    const localSuffix = localContent.slice(gatewayBase.length)
    if (containsOutputLink(localSuffix)) return true
  } else if (!gatewayBase && containsOutputLink(localContent)) {
    return true
  }

  const gatewayLabelBase = stripOutputArtifactLinksToLabels(gatewayContent).trimEnd()
  if (!gatewayLabelBase || !localContent.startsWith(gatewayLabelBase)) return false
  return containsOutputLink(localContent.slice(gatewayLabelBase.length))
}

function messagesMatch(a: ChatMessage, b: ChatMessage): boolean {
  if (a.role !== b.role) return false
  if (a.content === b.content) return true
  if (a.role !== 'assistant') return false
  return (
    isLocalArtifactAugmentedContent(a.content, b.content) ||
    isLocalArtifactAugmentedContent(b.content, a.content)
  )
}

function findIncomingOverlap(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): { start: number; length: number } {
  let bestStart = existing.length
  let bestLength = 0

  for (let start = 0; start < existing.length; start++) {
    let length = 0
    while (
      start + length < existing.length &&
      length < incoming.length &&
      messagesMatch(existing[start + length], incoming[length])
    ) {
      length++
    }

    if (length > bestLength || (length > 0 && length === bestLength && start > bestStart)) {
      bestStart = start
      bestLength = length
    }
  }

  return { start: bestStart, length: bestLength }
}

function contentBlockKey(block: ChatContentBlock): string {
  if (block.type === 'image') {
    const urlImageId = imageIdFromHistoryUrl(block.imageUrl)
    const imageId =
      urlImageId ??
      block.imageId ??
      (block.imageUrl?.startsWith('data:') ? computeImageId(block.imageUrl) : undefined)
    return imageId ? `image:${imageId}` : `image-url:${block.imageUrl ?? ''}`
  }
  return `text:${block.text ?? ''}`
}

function dedupeContentBlocks(
  blocks: ChatContentBlock[] | undefined,
): ChatContentBlock[] | undefined {
  const unique: ChatContentBlock[] = []
  const seen = new Set<string>()

  for (const block of blocks ?? []) {
    const key = contentBlockKey(block)
    if (seen.has(key)) continue
    unique.push({ ...block })
    seen.add(key)
  }

  return unique.length > 0 ? unique : undefined
}

function dedupeMessageContentBlocks(messages: ChatMessage[]): void {
  for (const message of messages) {
    const contentBlocks = dedupeContentBlocks(message.contentBlocks)
    if (contentBlocks) {
      message.contentBlocks = contentBlocks
    } else {
      delete message.contentBlocks
    }
  }
}

function mergeContentBlocks(
  oldBlocks: ChatContentBlock[] | undefined,
  newBlocks: ChatContentBlock[] | undefined,
): ChatContentBlock[] | undefined {
  const merged = dedupeContentBlocks(oldBlocks) ?? []
  const seen = new Set(merged.map(contentBlockKey))

  for (const block of newBlocks ?? []) {
    const key = contentBlockKey(block)
    if (seen.has(key)) continue
    merged.push({ ...block })
    seen.add(key)
  }

  return merged.length > 0 ? merged : undefined
}

function sanitizeAssistantArtifactLinks(messages: ChatMessage[]): void {
  for (const message of messages) {
    if (message.role === 'assistant') {
      message.content = sanitizeOutputArtifactLinks(message.content)
    }
  }
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

export function mergeToolCalls(
  oldToolCalls: ChatToolCall[] | undefined,
  newToolCalls: ChatToolCall[] | undefined,
): ChatToolCall[] | undefined {
  const oldCalls = oldToolCalls ?? []
  const newCalls = newToolCalls ?? []
  const max = Math.max(oldCalls.length, newCalls.length)
  const merged: ChatToolCall[] = []

  for (let i = 0; i < max; i++) {
    const oldCall = oldCalls[i]
    const newCall = newCalls[i]

    if (oldCall && newCall) {
      merged.push({
        // Prefer new gateway data (authoritative); old enriches with SSE-captured inputs
        toolName: newCall.toolName || oldCall.toolName,
        toolInput: hasValue(oldCall.toolInput) ? oldCall.toolInput : newCall.toolInput,
        toolOutput: hasValue(newCall.toolOutput) ? newCall.toolOutput : oldCall.toolOutput,
      })
    } else if (newCall) {
      merged.push({ ...newCall })
    }
    // Drop stale tool calls that exist only in the old message (no matching
    // new call from the gateway). Without this, tool calls leak from old
    // messages into new messages during gwSessionId-changed resets, and the
    // stale entries compound across successive merge cycles.
  }

  return merged.length > 0 ? merged : undefined
}

function mergeMessagePreservingOldData(
  oldMessage: ChatMessage,
  newMessage: ChatMessage,
): ChatMessage {
  const contentBlocks = mergeContentBlocks(oldMessage.contentBlocks, newMessage.contentBlocks)
  const toolCalls = mergeToolCalls(oldMessage.toolCalls, newMessage.toolCalls)
  const content = isLocalArtifactAugmentedContent(newMessage.content, oldMessage.content)
    ? newMessage.content
    : oldMessage.content || newMessage.content

  return {
    ...newMessage,
    id: oldMessage.id,
    createdAt: oldMessage.createdAt,
    content,
    ...(oldMessage.thinking || newMessage.thinking
      ? { thinking: oldMessage.thinking || newMessage.thinking }
      : {}),
    ...(oldMessage.error || newMessage.error
      ? { error: oldMessage.error || newMessage.error }
      : {}),
    ...(oldMessage.attachments || newMessage.attachments
      ? { attachments: oldMessage.attachments ?? newMessage.attachments }
      : {}),
    ...(oldMessage.kbSources || newMessage.kbSources
      ? { kbSources: oldMessage.kbSources ?? newMessage.kbSources }
      : {}),
    ...(contentBlocks ? { contentBlocks } : {}),
    ...(toolCalls ? { toolCalls } : {}),
  }
}

export function mergeLiveMessagesAppendOnly(
  existingMessages: ChatMessage[],
  incomingMessages: ChatMessage[],
): ChatMessage[] {
  if (existingMessages.length === 0) return incomingMessages.map(cloneMessage)
  if (incomingMessages.length === 0) return existingMessages.map(cloneMessage)

  const existing = existingMessages.map(cloneMessage)
  const incoming = incomingMessages.map(cloneMessage)
  const overlap = findIncomingOverlap(existing, incoming)
  const merged = existing

  for (let i = 0; i < overlap.length; i++) {
    merged[overlap.start + i] = mergeMessagePreservingOldData(
      merged[overlap.start + i],
      incoming[i],
    )
  }

  merged.push(...incoming.slice(overlap.length))
  return merged
}

function isSuffixOfLiveMessages(
  gatewayMessages: ChatMessage[],
  liveMessages: ChatMessage[],
): boolean {
  if (gatewayMessages.length === 0) return false
  if (gatewayMessages.length > liveMessages.length) return false

  const start = liveMessages.length - gatewayMessages.length
  for (let i = 0; i < gatewayMessages.length; i++) {
    if (!messagesMatch(liveMessages[start + i], gatewayMessages[i])) return false
  }
  return true
}

function hasLocalArtifactAugmentedMessages(
  gatewayMessages: ChatMessage[],
  liveMessages: ChatMessage[],
): boolean {
  if (gatewayMessages.length === 0) return false
  if (gatewayMessages.length > liveMessages.length) return false

  const start = liveMessages.length - gatewayMessages.length
  for (let i = 0; i < gatewayMessages.length; i++) {
    const live = liveMessages[start + i]
    const gateway = gatewayMessages[i]
    if (live.role !== 'assistant' || gateway.role !== 'assistant') continue
    if (isLocalArtifactAugmentedContent(live.content, gateway.content)) return true
  }
  return false
}

export function shouldUseLiveMessagesFallback(
  gatewayMessages: ChatMessage[],
  liveMessages: ChatMessage[],
  sameGatewaySession: boolean,
): boolean {
  if (!sameGatewaySession) return false
  if (hasLocalArtifactAugmentedMessages(gatewayMessages, liveMessages)) return true
  if (liveMessages.length <= gatewayMessages.length) return false
  if (isSuffixOfLiveMessages(gatewayMessages, liveMessages)) return true

  const missing = liveMessages.length - gatewayMessages.length
  return missing >= Math.max(20, Math.ceil(liveMessages.length * 0.25))
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
    if (msg.contentBlocks?.some((b) => b.type === 'image')) continue
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
  userAttachments?: { name: string; mimeType: string; content: string }[],
  capturedToolInputs?: { toolName: string; toolInput: unknown }[],
  assistantContentOverride?: string,
): Promise<void> {
  const rawResult = await client.request(
    'chat.history',
    { sessionKey, limit: LIVE_HISTORY_LIMIT },
    10_000,
  )
  const historyResult = rawResult as ChatHistoryResult
  const rawMessages = historyResult.messages ?? []
  if (rawMessages.length === 0) return

  let liveMessages = transformToLiveMessages(rawMessages)
  replaceLastAssistantMessageContent(liveMessages, assistantContentOverride)

  // Merge user-uploaded image attachments into the last user message's contentBlocks.
  // Gateway chat.history strips user image attachments, so we must re-inject them
  // to preserve images across page refreshes.
  if (userAttachments?.length) {
    for (let i = liveMessages.length - 1; i >= 0; i--) {
      if (liveMessages[i].role === 'user') {
        const blocks: ChatContentBlock[] = dedupeContentBlocks(liveMessages[i].contentBlocks) ?? []
        const seen = new Set(blocks.map(contentBlockKey))
        for (const att of userAttachments) {
          if (!att.mimeType.startsWith('image/')) continue
          const block: ChatContentBlock = {
            type: 'image',
            imageUrl: `data:${att.mimeType};base64,${att.content}`,
            mimeType: att.mimeType,
          }
          const key = contentBlockKey(block)
          if (seen.has(key)) continue
          blocks.push(block)
          seen.add(key)
        }
        if (blocks.length > 0) liveMessages[i].contentBlocks = blocks
        break
      }
    }
  }

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

  // 2b. SSE-captured tool inputs: agent:item events carry tool arguments that
  //     chat.history omits.
  if (capturedToolInputs?.length) {
    applyToolInputsToMessages(
      liveMessages,
      capturedToolInputs.map((t) => ({ name: t.toolName, input: String(t.toolInput) })),
    )
  }

  // Detect session reset via gateway session ID.
  // OpenClaw assigns an internal session ID (e.g. "16a0f62a") that changes
  // when the session is rebuilt (SIGUSR1, reconnect, etc.). If it changes,
  // archive the old liveMessages before overwriting.
  const gwSessionId = historyResult.sessionId

  await withSessionSnapshotLock(chatSessionId, async () => {
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      select: { gwSessionId: true, liveMessages: true },
    })
    const existingLive = Array.isArray(session?.liveMessages)
      ? (session.liveMessages as unknown as ChatMessage[])
      : []
    const archiveMessages: ChatMessage[] = []

    if (session?.gwSessionId && gwSessionId && session.gwSessionId !== gwSessionId) {
      if (existingLive.length > 0) {
        console.warn(
          `[live-snapshot] Session reset detected for ${chatSessionId}: ` +
            `gwSessionId changed ${session.gwSessionId} → ${gwSessionId}. Archiving old messages.`,
        )
        archiveMessages.push(...existingLive)
      }
    } else {
      liveMessages = mergeLiveMessagesAppendOnly(existingLive, liveMessages)
    }

    const overflow = Math.max(0, liveMessages.length - MAX_LIVE_MESSAGES)
    if (overflow > 0) {
      archiveMessages.push(...liveMessages.slice(0, overflow))
      liveMessages = liveMessages.slice(overflow)
    }

    await writeLiveMessages(chatSessionId, liveMessages, gwSessionId, archiveMessages)
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
 *
 * Uses content-based matching (role + text) instead of pure index matching
 * so that images survive even when message counts diverge (e.g. container
 * rebuild interrupted saveLiveSnapshot, leaving liveMessages shorter than
 * the gateway's current message list).
 */
export function mergeExistingContentBlocks(
  newMessages: ChatMessage[],
  oldMessages: ChatMessage[],
): void {
  // Build ordered lookup: role + content → array of contentBlocks entries.
  // Multiple messages with the same key (e.g., assistant messages with empty content
  // due to tool-call reclassification) each get their OWN entry in order.
  const blocksByKey = new Map<string, ChatContentBlock[][]>()
  for (const old of oldMessages) {
    if (!old.contentBlocks?.length) continue
    const key = `${old.role}:${old.content}`
    const arr = blocksByKey.get(key) ?? []
    arr.push(old.contentBlocks)
    blocksByKey.set(key, arr)
  }

  // Track consumption per key: each match is used exactly once, in order.
  const consumed = new Map<string, number>()
  for (const msg of newMessages) {
    if (msg.contentBlocks?.length) continue // already has images
    const key = `${msg.role}:${msg.content}`
    const arr = blocksByKey.get(key)
    if (!arr) continue
    const idx = consumed.get(key) ?? 0
    if (idx < arr.length) {
      msg.contentBlocks = arr[idx]
      consumed.set(key, idx + 1)
    }
  }
}

/**
 * Apply toolInput entries to messages in reverse order (last input → last tool).
 * Shared by saveLiveSnapshot, mergeToolInputs, and the client-side merge.
 */
function applyToolInputsToMessages(
  messages: ChatMessage[],
  inputs: { name: string; input: string }[],
): void {
  let si = inputs.length - 1
  for (let mi = messages.length - 1; mi >= 0 && si >= 0; mi--) {
    const msg = messages[mi]
    if (msg.role !== 'assistant' || !msg.toolCalls?.length) continue
    for (let ti = msg.toolCalls.length - 1; ti >= 0 && si >= 0; ti--) {
      const tc = msg.toolCalls[ti]
      if (tc.toolInput != null) continue
      if (tc.toolName !== inputs[si].name) continue
      tc.toolInput = inputs[si].input
      si--
    }
  }
}

/**
 * Carry forward toolInput from old liveMessages into new ones.
 * chat.history doesn't include tool call arguments — only results.
 * SSE agent:item events capture the descriptions; this merge prevents
 * them from being lost when saveLiveSnapshot overwrites liveMessages.
 */
export function mergeToolInputs(newMessages: ChatMessage[], oldMessages: ChatMessage[]): void {
  const oldInputs: { name: string; input: string }[] = []
  for (const msg of oldMessages) {
    if (msg.role !== 'assistant' || !msg.toolCalls?.length) continue
    for (const tc of msg.toolCalls) {
      const inp = tc.toolInput
      if (inp != null && inp !== '' && typeof inp === 'string') {
        oldInputs.push({ name: tc.toolName, input: inp })
      }
    }
  }
  if (oldInputs.length === 0) return
  applyToolInputsToMessages(newMessages, oldInputs)
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
  const data = buildLiveSnapshotRows(sessionId, messages)
  if (data.length > 0) {
    await prisma.chatMessageSnapshot.createMany({ data })
  }
}

function buildLiveSnapshotRows(
  sessionId: string,
  messages: ChatMessage[],
): Prisma.ChatMessageSnapshotCreateManyInput[] {
  const batchId = randomUUID()
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((msg, i) => ({
      chatSessionId: sessionId,
      batchId,
      orderIndex: i,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking ?? null,
      toolCalls: msg.toolCalls ? (msg.toolCalls as unknown as Prisma.InputJsonValue) : undefined,
      contentBlocks: msg.contentBlocks
        ? (msg.contentBlocks as unknown as Prisma.InputJsonValue)
        : undefined,
    }))
}

async function writeLiveMessages(
  chatSessionId: string,
  liveMessages: ChatMessage[],
  gwSessionId: string | undefined,
  archiveMessages: ChatMessage[],
): Promise<void> {
  sanitizeAssistantArtifactLinks(liveMessages)
  sanitizeAssistantArtifactLinks(archiveMessages)
  dedupeMessageContentBlocks(liveMessages)
  dedupeMessageContentBlocks(archiveMessages)

  // Pre-compute imageId on all image blocks so the image endpoint
  // can look up by field match instead of re-hashing on every request.
  stampImageIds(liveMessages)
  if (archiveMessages.length > 0) stampImageIds(archiveMessages)

  const updateArgs = {
    where: { id: chatSessionId },
    data: {
      liveMessages: liveMessages as unknown as Prisma.InputJsonValue,
      ...(gwSessionId ? { gwSessionId } : {}),
    },
  }
  const archiveData = buildLiveSnapshotRows(chatSessionId, archiveMessages)

  if (archiveData.length === 0) {
    await prisma.chatSession.update(updateArgs)
    return
  }

  await prisma.$transaction(async (tx) => {
    await tx.chatMessageSnapshot.createMany({ data: archiveData })
    await tx.chatSession.update(updateArgs)
  })
}

export async function appendLiveMessages(
  chatSessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  await withSessionSnapshotLock(chatSessionId, async () => {
    const session = await prisma.chatSession.findUnique({
      where: { id: chatSessionId },
      select: { liveMessages: true },
    })
    const existingLive = Array.isArray(session?.liveMessages)
      ? (session.liveMessages as unknown as ChatMessage[])
      : []
    const liveMessages = [...existingLive.map(cloneMessage), ...messages.map(cloneMessage)]
    dedupeMessageContentBlocks(liveMessages)
    stampImageIds(liveMessages)
    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { liveMessages: liveMessages as unknown as Prisma.InputJsonValue },
    })
  })
}
