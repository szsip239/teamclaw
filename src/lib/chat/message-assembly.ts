import type { ChatMessage, ChatSnapshotBatch, ChatHistoryResponse } from '@/types/chat'

function createSeparator(
  type: 'context-reset' | 'context-restart',
  id: string,
): ChatMessage {
  return {
    id,
    role: 'assistant' as const,
    content: `__separator__:${type}`,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Assemble snapshots and current messages into a flat list,
 * inserting separator markers between context resets.
 */
export function assembleHistoryMessages(
  snapshots: ChatSnapshotBatch[],
  currentMessages: ChatMessage[],
  isActive: boolean,
): ChatMessage[] {
  const result: ChatMessage[] = []
  // Assign stable position-based IDs so React keys survive transitions
  // between currentMessages ↔ snapshots (e.g. context reset).  Without
  // this, the ID change (DB UUID → current-N or vice versa) causes React
  // to unmount/remount every message component, producing a visible flash.
  let gi = 0

  for (let i = 0; i < snapshots.length; i++) {
    for (const msg of snapshots[i].messages) {
      result.push({ ...msg, id: `msg-${gi++}` })
    }

    const isLastBatch = i === snapshots.length - 1
    const hasMoreContent = !isLastBatch || (isActive && currentMessages.length > 0)
    if (hasMoreContent) {
      result.push(createSeparator('context-reset', `sep-${snapshots[i].batchId}`))
    }
  }

  if (isActive && currentMessages.length > 0) {
    for (const msg of currentMessages) {
      result.push({ ...msg, id: `msg-${gi++}` })
    }
  }

  return result
}

export function assembleFromResponse(data: ChatHistoryResponse): ChatMessage[] {
  return assembleHistoryMessages(
    data.snapshots ?? [],
    data.currentMessages ?? [],
    data.isActive,
  )
}

export function assistantMessageCompletesTurn(
  message: Pick<ChatMessage, 'role' | 'content' | 'isFinal' | 'error' | 'stopReason'>,
): boolean {
  if (message.role !== 'assistant') return false
  if (message.isFinal === true) return true
  if (message.stopReason === 'error') return true
  return message.isFinal !== false && (!!message.content || !!message.error)
}

export function assistantCompletesTurnAfter(
  messages: Pick<ChatMessage, 'role' | 'content' | 'isFinal' | 'error' | 'stopReason'>[],
  index: number,
): boolean {
  return messages.slice(index + 1).some(assistantMessageCompletesTurn)
}

export function latestUserTurnHasFinalAssistant(
  messages: Pick<ChatMessage, 'role' | 'content' | 'isFinal' | 'error' | 'stopReason'>[],
): boolean {
  const lastUserIdx = messages.findLastIndex((message) => message.role === 'user')
  if (lastUserIdx === -1) return false

  return assistantCompletesTurnAfter(messages, lastUserIdx)
}
