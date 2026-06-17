import type { ChatRuntime } from './runtime'
import type { ChatMessage } from '@/types/chat'

function validTime(value: string | undefined): boolean {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
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
