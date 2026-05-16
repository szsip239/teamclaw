import type { ChatMessage, KbSourceRef } from '@/types/chat'

const SEPARATOR_PREFIX = '__separator__:'

export function selectVisibleKbSources(
  message: ChatMessage,
  isStreaming: boolean,
  liveSources: KbSourceRef[],
): KbSourceRef[] {
  if (message.kbSources?.length) return message.kbSources
  return isStreaming ? liveSources : []
}

export function attachKbSourcesToLatestAssistant(
  messages: ChatMessage[],
  sources: KbSourceRef[],
): ChatMessage[] {
  if (sources.length === 0) return messages

  const index = findLatestAssistantIndex(messages)
  if (index === -1) return messages

  return messages.map((message, i) =>
    i === index ? { ...message, kbSources: sources } : message,
  )
}

function findLatestAssistantIndex(messages: ChatMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.role !== 'assistant') continue
    if (message.content.startsWith(SEPARATOR_PREFIX)) continue
    return i
  }
  return -1
}
