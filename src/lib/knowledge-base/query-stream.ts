/**
 * Fetch-based SSE client for KB Q&A streaming.
 * Returns an async iterator of parsed SSE events.
 */
export interface KbSSEEvent {
  type: 'retrieval' | 'chunk' | 'reasoning' | 'error' | 'done'
  data: Record<string, unknown>
}

export async function* streamKbQuery(
  kbId: string,
  question: string,
  generateAnswer: boolean = true,
  topK: number = 5,
  signal?: AbortSignal,
): AsyncGenerator<KbSSEEvent> {
  const res = await fetch(`/api/v1/knowledge-bases/${kbId}/query/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ question, generateAnswer, topK }),
    signal,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    yield { type: 'error', data: { message: err.error || 'Query failed' } }
    return
  }

  if (!res.body) {
    yield { type: 'error', data: { message: 'No response body' } }
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE format: "event: type\ndata: json\n\n"
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? '' // Keep incomplete event in buffer

      for (const eventStr of events) {
        if (!eventStr.trim()) continue

        let eventType = ''
        const dataLines: string[] = []

        for (const line of eventStr.split('\n')) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            dataLines.push(line.slice(6))
          } else if (line.startsWith('data:')) {
            // data: with no space (edge case)
            dataLines.push(line.slice(5))
          }
        }

        const eventData = dataLines.join('\n')
        if (eventType && eventData) {
          try {
            const parsed = JSON.parse(eventData) as Record<string, unknown>
            yield { type: eventType as KbSSEEvent['type'], data: parsed }
          } catch {
            // Skip malformed events
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}
