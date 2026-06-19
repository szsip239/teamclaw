import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  archiveSession: vi.fn(),
  getRuntimeGatewayClient: vi.fn(),
  prisma: {
    chatSession: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/chat/snapshot-helpers', () => ({
  archiveSession: mocks.archiveSession,
}))

vi.mock('@/lib/chat/runtime-gateway', () => ({
  getRuntimeGatewayClient: mocks.getRuntimeGatewayClient,
}))

import { POST } from './route'

function createRequest() {
  return new NextRequest('http://localhost/api/v1/chat/sessions/conversation-1/clear-context', {
    headers: { 'x-user-id': 'user-1' },
    method: 'POST',
  })
}

function routeCtx(id = 'conversation-1') {
  return { params: Promise.resolve({ id }) }
}

function sessionRow(id: string, runtime: 'OPENCLAW' | 'PI') {
  return {
    agentId: 'main',
    conversationGroupId: 'conversation-1',
    id,
    instanceId: 'instance-1',
    isActive: true,
    runtime,
    sessionId: `agent:${runtime}:tc:user-1`,
    userId: 'user-1',
  }
}

describe('chat session clear-context route', () => {
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
    mocks.archiveSession.mockResolvedValue(undefined)
    mocks.prisma.chatSession.update.mockResolvedValue({})
    mocks.getRuntimeGatewayClient.mockImplementation(async () => ({
      client: { request: vi.fn() },
      release: vi.fn(),
      temporary: true,
    }))
  })

  it('clears every active runtime session when the visible conversation group id is provided', async () => {
    mocks.prisma.chatSession.findUnique.mockResolvedValue(null)
    mocks.prisma.chatSession.findMany.mockResolvedValue([
      sessionRow('openclaw-session', 'OPENCLAW'),
      sessionRow('pi-session', 'PI'),
    ])

    const response = await POST(createRequest(), routeCtx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mocks.archiveSession).toHaveBeenCalledTimes(2)
    expect(mocks.archiveSession).toHaveBeenCalledWith(
      'openclaw-session',
      'instance-1',
      'main',
      'user-1',
      expect.anything(),
      expect.objectContaining({
        runtime: 'openclaw',
        triggerMemoryDump: true,
        waitForNewCompletion: true,
      }),
    )
    expect(mocks.archiveSession).toHaveBeenCalledWith(
      'pi-session',
      'instance-1',
      'main',
      'user-1',
      expect.anything(),
      expect.objectContaining({
        runtime: 'pi',
        triggerMemoryDump: false,
        waitForNewCompletion: false,
      }),
    )
    expect(mocks.prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: 'openclaw-session' },
      data: { liveMessages: expect.anything(), messageCount: 0 },
    })
    expect(mocks.prisma.chatSession.update).toHaveBeenCalledWith({
      where: { id: 'pi-session' },
      data: { liveMessages: expect.anything(), messageCount: 0 },
    })
  })
})
