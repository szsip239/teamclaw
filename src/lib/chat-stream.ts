import type { ChatStreamEvent } from '@/types/chat'

export async function* streamChat(
  body: {
    instanceId: string
    agentId: string
    message: string
    sessionId?: string
    attachments?: { name: string; content: string; mimeType: string }[]
  },
  signal?: AbortSignal,
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch('/api/v1/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(
      (data as { error?: string } | null)?.error || '发送消息失败',
    )
  }

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as ChatStreamEvent
          yield event
        } catch {
          // skip malformed
        }
      }
    }
  }
}
