import { NextResponse } from 'next/server'
import { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import {
  mergeExistingContentBlocks,
  mergeLiveMessagesAppendOnly,
  mergeToolInputs,
  shouldUseLiveMessagesFallback,
  markNonDeliverableTerminalTurn,
  transformToLiveMessages,
  trimCurrentMessagesOverlappingSnapshot,
} from '@/lib/chat/snapshot-helpers'
import { computeImageId } from '@/lib/chat/image-helpers'
import { activeRuns } from '@/lib/chat/active-runs'
import { imageBlockDisplayKey, imageIdFromHistoryUrl } from '@/lib/chat/image-blocks'
import { sanitizeOutputArtifactLinks } from '@/lib/session-files/artifacts'
import {
  finalizeAssistantArtifacts,
  messageHasOutputArtifactLink,
} from '@/lib/chat/artifact-finalizer'
import { buildChatRuntimeSessionKey, fromDbChatRuntime } from '@/lib/chat/runtime'
import { getRuntimeGatewayClient } from '@/lib/chat/runtime-gateway'
import { dockerManager } from '@/lib/docker/manager'
import {
  sortChatMessagesForDisplay,
  withRuntimeMessageMetadata,
} from '@/lib/chat/history-runtime-messages'
import { mergeOverlappingSnapshotBatches } from '@/lib/chat/history-snapshot-batches'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type {
  ChatMessage,
  ChatToolCall,
  ChatSnapshotBatch,
  ChatHistoryResponse,
  ChatContentBlock,
} from '@/types/chat'

function transformMessages(raw: ChatHistoryMessage[]): ChatMessage[] {
  // Use index-based IDs so the same message gets the same ID across polls.
  // Random UUIDs would change every poll → React key changes → component
  // unmount/remount → collapsible sections (thinking, tools) lose their
  // expanded state.
  return transformToLiveMessages(raw, {
    idForMessage: ({ messageSeq }) => `current-${messageSeq}`,
    fallbackCreatedAt: () => '',
    markNonDeliverableTerminal: false,
  })
}

function lastAssistantMessageIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i
  }
  return -1
}

async function finalizeHistoryArtifacts(params: {
  agentId: string
  chatSessionId: string
  instanceId: string
  messages: ChatMessage[]
  runStartedAt: Date
}): Promise<ChatMessage[]> {
  const assistantIndex = lastAssistantMessageIndex(params.messages)
  if (assistantIndex === -1) return params.messages

  const assistant = params.messages[assistantIndex]
  if (!assistant.content || messageHasOutputArtifactLink(assistant.content)) return params.messages

  const instance = await prisma.instance.findUnique({
    where: { id: params.instanceId },
    select: { containerId: true, workspacePath: true },
  })
  if (!instance?.containerId && !instance?.workspacePath) return params.messages

  const result = await finalizeAssistantArtifacts({
    agentId: params.agentId,
    chatSessionId: params.chatSessionId,
    runStartedAt: params.runStartedAt,
    assistantText: assistant.content,
    containerId: instance.containerId,
    workspacePath: instance.workspacePath,
    execWithOutput: dockerManager.execWithOutput.bind(dockerManager),
  })
  if (!result) return params.messages

  const sessionMessages = params.messages.map((message, index) =>
    index === assistantIndex ? { ...message, content: result.content } : message,
  )
  await prisma.chatSession.update({
    where: { id: params.chatSessionId },
    data: { liveMessages: sessionMessages as unknown as Prisma.InputJsonValue },
  })
  return sessionMessages
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

function replaceInlineImagesBySource(messages: ChatMessage[], fallbackSessionId: string): void {
  const bySession = new Map<string, ChatMessage[]>()
  for (const message of messages) {
    const sourceSessionId = message.sourceSessionId ?? fallbackSessionId
    const group = bySession.get(sourceSessionId) ?? []
    group.push(message)
    bySession.set(sourceSessionId, group)
  }
  for (const [sourceSessionId, group] of bySession) {
    replaceInlineImages(group, sourceSessionId)
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

    const session = await prisma.chatSession.findFirst({
      where: {
        userId: ctx.user.id,
        OR: [{ id }, { conversationGroupId: id }],
      },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const conversationGroupId = session.conversationGroupId ?? session.id
    const groupSessions = await prisma.chatSession.findMany({
      where: {
        userId: ctx.user.id,
        instanceId: session.instanceId,
        agentId: session.agentId,
        OR: [{ id: conversationGroupId }, { conversationGroupId }],
      },
      orderBy: [{ createdAt: 'asc' }],
    })
    const groupSessionIds = groupSessions.map((item) => item.id)
    const runtimeBySessionId = new Map(
      groupSessions.map((item) => [item.id, fromDbChatRuntime(item.runtime)]),
    )

    // 1. Load snapshot messages from DB
    const snapshotRows = await prisma.chatMessageSnapshot.findMany({
      where: { chatSessionId: { in: groupSessionIds } },
      orderBy: [{ createdAt: 'asc' }, { orderIndex: 'asc' }],
    })

    // 2. Group by batchId
    const batchMap = new Map<string, { createdAt: string; messages: ChatMessage[] }>()
    for (const row of snapshotRows) {
      const batchId = `${row.chatSessionId}:${row.batchId}`
      if (!batchMap.has(batchId)) {
        batchMap.set(batchId, {
          createdAt: row.createdAt.toISOString(),
          messages: [],
        })
      }
      const batch = batchMap.get(batchId)!
      batch.messages.push({
        id: row.id,
        sourceSessionId: row.chatSessionId,
        role: row.role as 'user' | 'assistant',
        content: sanitizeOutputArtifactLinks(row.content),
        messageSeq: row.orderIndex,
        ...(row.contentBlocks
          ? { contentBlocks: row.contentBlocks as unknown as ChatContentBlock[] }
          : {}),
        ...(row.thinking ? { thinking: row.thinking } : {}),
        ...(row.toolCalls ? { toolCalls: row.toolCalls as unknown as ChatToolCall[] } : {}),
        runtime: runtimeBySessionId.get(row.chatSessionId),
        createdAt: row.createdAt.toISOString(),
      })
    }

    const snapshots: ChatSnapshotBatch[] = mergeOverlappingSnapshotBatches(
      Array.from(batchMap.entries()).map(([batchId, data]) => ({
        batchId,
        createdAt: data.createdAt,
        messages: data.messages,
      })),
    )

    // 3. If any runtime session is active, load current messages from its gateway
    let currentMessages: ChatMessage[] = []
    let connectionStatus: 'ok' | 'unreachable' | 'session-lost' = 'ok'
    const sessionIsActive = groupSessions.some((item) => item.isActive)

    for (const runtimeSession of groupSessions) {
      if (!runtimeSession.isActive) continue
      try {
        const runtime = fromDbChatRuntime(runtimeSession.runtime)
        const lease = await getRuntimeGatewayClient(runtimeSession.instanceId, runtime)
        if (lease) {
          try {
            const sessionKey = buildChatRuntimeSessionKey(
              runtime,
              runtimeSession.agentId,
              runtimeSession.userId,
            )
            const rawResult = await lease.client.request(
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
            if (runtimeSession.liveMessages) {
              const cached = runtimeSession.liveMessages as unknown as ChatMessage[]
              if (Array.isArray(cached)) {
                cachedLive = cached
              }
            }

            const sameGatewaySession =
              !runtimeSession.gwSessionId ||
              !historyResult.sessionId ||
              runtimeSession.gwSessionId === historyResult.sessionId

            let sessionMessages: ChatMessage[]
            if (cachedLive && sameGatewaySession) {
              sessionMessages = mergeLiveMessagesAppendOnly(cachedLive, msgs)
            } else if (
              cachedLive &&
              shouldUseLiveMessagesFallback(msgs, cachedLive, sameGatewaySession)
            ) {
              sessionMessages = mergeLiveMessagesAppendOnly(cachedLive, msgs)
            } else {
              if (cachedLive) {
                mergeExistingContentBlocks(msgs, cachedLive)
                mergeToolInputs(msgs, cachedLive)
              }
              sessionMessages = msgs
            }
            const runIsActive = activeRuns.has(runtimeSession.id)
            if (!runIsActive) {
              markNonDeliverableTerminalTurn(sessionMessages)
              sessionMessages = await finalizeHistoryArtifacts({
                agentId: runtimeSession.agentId,
                chatSessionId: runtimeSession.id,
                instanceId: runtimeSession.instanceId,
                messages: sessionMessages,
                runStartedAt: runtimeSession.lastMessageAt ?? runtimeSession.updatedAt,
              })
            }
            const baseTime = new Date(
              runtimeSession.lastMessageAt ?? runtimeSession.updatedAt,
            ).getTime()
            sessionMessages = withRuntimeMessageMetadata(sessionMessages, {
              sourceSessionId: runtimeSession.id,
              runtime,
              baseTimeMs: baseTime,
            })
            replaceInlineImagesBySource(sessionMessages, runtimeSession.id)
            currentMessages.push(...sessionMessages)

            // Stale session detection: gateway responded but session was destroyed (SIGUSR1 restart).
            // Don't auto-archive — let the user decide whether to retry or start a new conversation.
            // The session stays active so the user can simply send a new message to continue.
            const isPolling = new URL(_req.url).searchParams.get('polling') === 'true'
            const sessionAgeMs = Date.now() - runtimeSession.createdAt.getTime()
            if (
              !isPolling &&
              !activeRuns.has(runtimeSession.id) &&
              sessionMessages.length === 0 &&
              sessionAgeMs > 30_000 &&
              runtimeSession.messageCount > 0
            ) {
              connectionStatus = 'session-lost'
              if (runtimeSession.liveMessages) {
                const cached = runtimeSession.liveMessages as unknown as ChatMessage[]
                if (Array.isArray(cached)) {
                  currentMessages.push(
                    ...withRuntimeMessageMetadata(cached, {
                      sourceSessionId: runtimeSession.id,
                      runtime,
                      baseTimeMs: baseTime,
                      idPrefix: 'live:',
                    }),
                  )
                }
              }
            }
          } finally {
            lease.release()
          }
        } else {
          // Client not available (instance not yet reconnected after restart).
          // Fall back to liveMessages for display without archiving the session.
          connectionStatus = 'unreachable'
          if (runtimeSession.liveMessages) {
            const cached = runtimeSession.liveMessages as unknown as ChatMessage[]
            if (Array.isArray(cached)) {
              currentMessages.push(
                ...withRuntimeMessageMetadata(cached, {
                  sourceSessionId: runtimeSession.id,
                  runtime: fromDbChatRuntime(runtimeSession.runtime),
                  baseTimeMs: new Date(
                    runtimeSession.lastMessageAt ?? runtimeSession.updatedAt,
                  ).getTime(),
                  idPrefix: 'live:',
                }),
              )
            }
          }
        }
      } catch {
        // Gateway unreachable / timeout — show warning, keep session active for retry.
        // Fall back to liveMessages so the user still sees their conversation.
        connectionStatus = 'unreachable'
        if (runtimeSession.liveMessages) {
          const cached = runtimeSession.liveMessages as unknown as ChatMessage[]
          if (Array.isArray(cached)) {
            currentMessages.push(
              ...withRuntimeMessageMetadata(cached, {
                sourceSessionId: runtimeSession.id,
                runtime: fromDbChatRuntime(runtimeSession.runtime),
                baseTimeMs: new Date(
                  runtimeSession.lastMessageAt ?? runtimeSession.updatedAt,
                ).getTime(),
                idPrefix: 'live:',
              }),
            )
          }
        }
      }
    }
    currentMessages = sortChatMessagesForDisplay(currentMessages)

    // Deduplicate: if sessions.delete failed during clear-context, the gateway
    // can still return old messages that were already snapshotted.
    currentMessages = trimCurrentMessagesOverlappingSnapshot(snapshots, currentMessages)

    replaceInlineImagesBySource(currentMessages, conversationGroupId)
    for (const batch of snapshots) {
      replaceInlineImagesBySource(batch.messages, conversationGroupId)
    }

    const response: ChatHistoryResponse = {
      snapshots,
      currentMessages,
      isActive: sessionIsActive,
      ...(connectionStatus !== 'ok' ? { connectionStatus } : {}),
      ...(groupSessionIds.some((sessionId) => activeRuns.has(sessionId))
        ? { isRunning: true }
        : {}),
    }

    return NextResponse.json(response)
  }),
)
