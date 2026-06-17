import { describe, expect, it } from 'vitest'
import { withRuntimeMessageMetadata } from './history-runtime-messages'
import type { ChatMessage } from '@/types/chat'

function message(id: string, createdAt?: string): ChatMessage {
  return {
    id,
    role: 'user',
    content: id,
    ...(createdAt ? { createdAt } : { createdAt: '' }),
  }
}

describe('withRuntimeMessageMetadata', () => {
  it('preserves real live message timestamps when merging runtime sessions', () => {
    const result = withRuntimeMessageMetadata(
      [
        message('old-pi', '2026-06-17T05:00:20.647Z'),
        message('new-pi', '2026-06-17T14:11:03.154Z'),
      ],
      {
        sourceSessionId: 'pi-session',
        runtime: 'pi',
        baseTimeMs: Date.parse('2026-06-17T14:11:03.154Z'),
      },
    )

    expect(result.map((item) => item.createdAt)).toEqual([
      '2026-06-17T05:00:20.647Z',
      '2026-06-17T14:11:03.154Z',
    ])
  })

  it('falls back to deterministic session-relative timestamps when history has no time', () => {
    const result = withRuntimeMessageMetadata([message('a'), message('b')], {
      sourceSessionId: 'openclaw-session',
      runtime: 'openclaw',
      baseTimeMs: Date.parse('2026-06-17T14:11:20.000Z'),
      idPrefix: 'live:',
    })

    expect(result).toMatchObject([
      {
        id: 'openclaw-session:live:a',
        sourceSessionId: 'openclaw-session',
        runtime: 'openclaw',
        createdAt: '2026-06-17T14:11:20.000Z',
      },
      {
        id: 'openclaw-session:live:b',
        sourceSessionId: 'openclaw-session',
        runtime: 'openclaw',
        createdAt: '2026-06-17T14:11:20.001Z',
      },
    ])
  })
})
