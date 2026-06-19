import { describe, expect, it } from 'vitest'
import { sortChatSessionsForDisplay } from './session-sort'
import type { ChatSessionResponse } from '@/types/chat'

function session(
  id: string,
  overrides: Partial<ChatSessionResponse>,
): ChatSessionResponse {
  return {
    id,
    sessionId: `key:${id}`,
    runtime: 'openclaw',
    instanceId: 'sales',
    instanceName: 'sales',
    agentId: 'main',
    title: id,
    lastMessageAt: null,
    messageCount: 0,
    isActive: false,
    createdAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('sortChatSessionsForDisplay', () => {
  it('orders by recent activity instead of active flag', () => {
    const sorted = sortChatSessionsForDisplay([
      session('old-active', {
        isActive: true,
        lastMessageAt: '2026-06-14T10:00:00.000Z',
      }),
      session('new-inactive', {
        isActive: false,
        lastMessageAt: '2026-06-17T10:00:00.000Z',
      }),
      session('empty-active', {
        isActive: true,
        createdAt: '2026-06-15T10:00:00.000Z',
      }),
    ])

    expect(sorted.map((item) => item.id)).toEqual([
      'new-inactive',
      'empty-active',
      'old-active',
    ])
  })
})
