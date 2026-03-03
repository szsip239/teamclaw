import type { ChatStreamEvent } from '@/types/chat'
import { getAccessToken } from '@/lib/api-client'

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
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = getAccessToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ""
  const response = await fetch(`${apiUrl}/api/v1/chat/send`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
    signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(
      (data as { message?: string; error?: string } | null)?.message ||
        (data as { message?: string; error?: string } | null)?.error ||
        '发送消息失败',
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
