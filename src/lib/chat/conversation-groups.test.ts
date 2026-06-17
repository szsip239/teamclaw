import { describe, expect, it } from 'vitest'
import { groupChatSessions } from './conversation-groups'

describe('chat conversation groups', () => {
  it('merges runtime-specific sessions into one visible conversation', () => {
    const grouped = groupChatSessions([
      {
        id: 'openclaw-session',
        conversationGroupId: null,
        sessionId: 'agent:main:tc:user',
        runtime: 'openclaw',
        instanceId: 'inst',
        instanceName: 'Sales',
        agentId: 'main',
        title: 'OpenClaw first',
        lastMessageAt: '2026-06-17T08:00:00.000Z',
        messageCount: 2,
        isActive: true,
        createdAt: '2026-06-17T07:00:00.000Z',
      },
      {
        id: 'pi-session',
        conversationGroupId: 'openclaw-session',
        sessionId: 'agent:pi:main:tc:user',
        runtime: 'pi',
        instanceId: 'inst',
        instanceName: 'Sales',
        agentId: 'main',
        title: 'Pi later',
        lastMessageAt: '2026-06-17T09:00:00.000Z',
        messageCount: 3,
        isActive: true,
        createdAt: '2026-06-17T08:30:00.000Z',
      },
    ])

    expect(grouped).toHaveLength(1)
    expect(grouped[0]).toMatchObject({
      id: 'openclaw-session',
      runtime: 'pi',
      title: 'Pi later',
      messageCount: 5,
      sessionIdsByRuntime: {
        openclaw: 'openclaw-session',
        pi: 'pi-session',
      },
      runtimes: ['openclaw', 'pi'],
    })
  })

  it('keeps legacy sessions isolated when no group id exists', () => {
    const grouped = groupChatSessions([
      {
        id: 'legacy-a',
        conversationGroupId: null,
        sessionId: 'agent:a:tc:user',
        runtime: 'openclaw',
        instanceId: 'inst',
        instanceName: 'Sales',
        agentId: 'a',
        title: null,
        lastMessageAt: null,
        messageCount: 0,
        isActive: false,
        createdAt: '2026-06-17T07:00:00.000Z',
      },
      {
        id: 'legacy-b',
        conversationGroupId: null,
        sessionId: 'agent:b:tc:user',
        runtime: 'openclaw',
        instanceId: 'inst',
        instanceName: 'Sales',
        agentId: 'b',
        title: null,
        lastMessageAt: null,
        messageCount: 0,
        isActive: false,
        createdAt: '2026-06-17T07:00:00.000Z',
      },
    ])

    expect(grouped.map((s) => s.id)).toEqual(['legacy-a', 'legacy-b'])
  })
})
