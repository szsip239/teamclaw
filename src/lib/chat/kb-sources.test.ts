import { describe, expect, it } from 'vitest'
import type { ChatMessage, KbSourceRef } from '@/types/chat'
import {
  attachKbSourcesToLatestAssistant,
  selectVisibleKbSources,
} from './kb-sources'

const source: KbSourceRef = {
  kbId: 'kb-1',
  kbName: 'Steel Rope',
  category: 'INTERNAL',
  text: 'source text',
  score: 0.91,
}

function assistant(content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  }
}

function user(content: string): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
  }
}

describe('KB source display helpers', () => {
  it('does not show stale live sources on completed messages without own sources', () => {
    expect(selectVisibleKbSources(assistant('New session started.'), false, [source])).toEqual([])
  })

  it('shows message-owned sources on completed messages', () => {
    expect(selectVisibleKbSources(assistant('Answer', { kbSources: [source] }), false, [])).toEqual([
      source,
    ])
  })

  it('shows live sources while the assistant message is streaming', () => {
    expect(selectVisibleKbSources(assistant('Partial answer'), true, [source])).toEqual([source])
  })

  it('attaches sources only to the latest real assistant message', () => {
    const messages: ChatMessage[] = [
      assistant('Old answer'),
      assistant('__separator__:context-reset'),
      user('What changed?'),
      assistant('New answer'),
    ]

    const updated = attachKbSourcesToLatestAssistant(messages, [source])

    expect(updated[0].kbSources).toBeUndefined()
    expect(updated[1].kbSources).toBeUndefined()
    expect(updated[2].kbSources).toBeUndefined()
    expect(updated[3].kbSources).toEqual([source])
  })
})
