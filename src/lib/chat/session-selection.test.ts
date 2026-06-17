import { describe, expect, it } from 'vitest'
import { selectMatchingChatSession } from './session-selection'
import type { ChatAgentInfo, ChatSessionResponse } from '@/types/chat'

const agent: ChatAgentInfo = {
  instanceId: 'sales',
  instanceName: 'sales',
  agentId: 'main',
  agentName: 'Main',
  status: 'active',
}

function session(
  id: string,
  overrides: Partial<ChatSessionResponse> = {},
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
    isActive: true,
    createdAt: '2026-06-17T00:00:00.000Z',
    ...overrides,
  }
}

describe('selectMatchingChatSession', () => {
  it('waits for a freshly-created active session to appear in cache', () => {
    expect(selectMatchingChatSession([session('old-group')], agent, 'new-group')).toBeNull()
  })

  it('falls back to the selected agent when the active id belongs to another agent', () => {
    const selected = session('selected-group')
    expect(
      selectMatchingChatSession(
        [
          session('other-group', { agentId: 'other' }),
          selected,
        ],
        agent,
        'other-group',
      ),
    ).toBe(selected)
  })
})
