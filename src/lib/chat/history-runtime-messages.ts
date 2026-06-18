import type { ChatRuntime } from './runtime'
import type { ChatMessage } from '@/types/chat'

function validTime(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function messageTime(message: Pick<ChatMessage, 'createdAt'>): number {
  const time = Date.parse(message.createdAt)
  return Number.isNaN(time) ? 0 : time
}

function messageSeq(message: Pick<ChatMessage, 'messageSeq'>): number {
  return typeof message.messageSeq === 'number' ? message.messageSeq : Number.POSITIVE_INFINITY
}

export function compareChatMessagesForDisplay(
  a: Pick<ChatMessage, 'createdAt' | 'messageSeq'>,
  b: Pick<ChatMessage, 'createdAt' | 'messageSeq'>,
): number {
  const timeDelta = messageTime(a) - messageTime(b)
  if (timeDelta !== 0) return timeDelta
  return messageSeq(a) - messageSeq(b)
}

export function sortChatMessagesForDisplay(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort(compareChatMessagesForDisplay)
}

export function withRuntimeMessageMetadata(
  messages: ChatMessage[],
  options: {
    sourceSessionId: string
    runtime: ChatRuntime
    baseTimeMs: number
    idPrefix?: string
  },
): ChatMessage[] {
  return messages.map((message, index) => ({
    ...message,
    id: `${options.sourceSessionId}:${options.idPrefix ?? ''}${message.id}`,
    sourceSessionId: options.sourceSessionId,
    runtime: options.runtime,
    createdAt: validTime(message.createdAt)
      ? message.createdAt
      : new Date(options.baseTimeMs + index).toISOString(),
  }))
}
