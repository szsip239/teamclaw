import { describe, expect, it } from 'vitest'
import { latestUserTurnHasFinalAssistant } from './message-assembly'
import type { ChatMessage } from '@/types/chat'

function message(role: ChatMessage['role'], content: string, extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `${role}-${content}`,
    role,
    content,
    createdAt: '2026-06-15T00:00:00.000Z',
    ...extra,
  }
}

describe('latestUserTurnHasFinalAssistant', () => {
  it('treats a v4 final assistant response as completed', () => {
    expect(
      latestUserTurnHasFinalAssistant([
        message('user', 'create report'),
        message('assistant', '', { isFinal: false, stopReason: 'toolUse' }),
        message('assistant', '[report.html](output/report.html)', {
          isFinal: true,
          stopReason: 'stop',
        }),
      ]),
    ).toBe(true)
  })

  it('does not treat a staged toolUse response as completed', () => {
    expect(
      latestUserTurnHasFinalAssistant([
        message('user', 'create report'),
        message('assistant', 'writing file', { isFinal: false, stopReason: 'toolUse' }),
      ]),
    ).toBe(false)
  })
})
