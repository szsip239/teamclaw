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

  for (let i = 0; i < snapshots.length; i++) {
    result.push(...snapshots[i].messages)

    const isLastBatch = i === snapshots.length - 1
    const hasMoreContent = !isLastBatch || (isActive && currentMessages.length > 0)
    if (hasMoreContent) {
      result.push(createSeparator('context-reset', `sep-${snapshots[i].batchId}`))
    }
  }

  if (isActive && currentMessages.length > 0) {
    result.push(...currentMessages)
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
