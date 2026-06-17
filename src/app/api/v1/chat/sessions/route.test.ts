import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  prisma: {
    chatSession: {
      findMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

import { GET } from './route'

function createRequest() {
  return new NextRequest('http://localhost/api/v1/chat/sessions', {
    headers: { 'x-user-id': 'user-1' },
  })
}

function sessionRow(overrides: Record<string, unknown>) {
  return {
    agentId: 'main',
    conversationGroupId: 'conversation-1',
    createdAt: new Date('2026-06-17T08:00:00.000Z'),
    id: 'openclaw-session',
    instance: { name: 'Sales' },
    instanceId: 'sales-instance',
    isActive: false,
    lastMessageAt: new Date('2026-06-17T08:01:00.000Z'),
    messageCount: 1,
    runtime: 'OPENCLAW',
    sessionId: 'agent:main:tc:user-1',
    title: 'World Cup report',
    ...overrides,
  }
}

describe('chat sessions list', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prisma.user.findUnique.mockResolvedValue({
      avatar: null,
      department: null,
      departmentId: null,
      email: 'user@example.com',
      id: 'user-1',
      name: 'Test User',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
    })
  })

  it('returns one visible conversation for OpenClaw and Pi sessions in the same group', async () => {
    mocks.prisma.chatSession.findMany.mockResolvedValue([
      sessionRow({
        id: 'pi-session',
        isActive: true,
        lastMessageAt: new Date('2026-06-17T08:02:00.000Z'),
        messageCount: 2,
        runtime: 'PI',
      }),
      sessionRow({ id: 'openclaw-session' }),
    ])

    const response = await GET(createRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.sessions).toHaveLength(1)
    expect(body.sessions[0]).toMatchObject({
      id: 'conversation-1',
      conversationGroupId: 'conversation-1',
      isActive: true,
      messageCount: 3,
      runtime: 'pi',
      runtimes: ['openclaw', 'pi'],
      sessionIdsByRuntime: {
        openclaw: 'openclaw-session',
        pi: 'pi-session',
      },
    })
  })
})
