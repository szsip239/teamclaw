import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dockerManager: {
    removeContainerDir: vi.fn(),
  },
  ensureRegistryInitialized: vi.fn(),
  prisma: {
    chatSession: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    instance: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  registry: {
    getAdapter: vi.fn(),
    getClient: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/docker/manager', () => ({
  dockerManager: mocks.dockerManager,
}))

vi.mock('@/lib/gateway/registry', () => ({
  ensureRegistryInitialized: mocks.ensureRegistryInitialized,
  registry: mocks.registry,
}))

import { DELETE } from './route'

function createRequest() {
  return new NextRequest('http://localhost/api/v1/chat/sessions/conversation-1', {
    headers: { 'x-user-id': 'user-1' },
    method: 'DELETE',
  })
}

function routeCtx(id = 'conversation-1') {
  return { params: Promise.resolve({ id }) }
}

function sessionRow(id: string) {
  return {
    agentId: 'main',
    conversationGroupId: 'conversation-1',
    id,
    instanceId: 'instance-1',
    isActive: false,
    runtime: 'OPENCLAW',
    sessionId: `agent:main:tc:user-1:${id}`,
    userId: 'user-1',
  }
}

describe('chat session delete route', () => {
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
    mocks.prisma.instance.findUnique.mockResolvedValue({ containerId: 'container-1' })
  })

  it('deletes all runtime sessions when the visible conversation group id is deleted', async () => {
    mocks.prisma.chatSession.findUnique.mockResolvedValue(null)
    mocks.prisma.chatSession.findMany.mockResolvedValue([
      sessionRow('openclaw-session'),
      sessionRow('pi-session'),
    ])
    mocks.prisma.chatSession.deleteMany.mockResolvedValue({ count: 2 })

    const response = await DELETE(createRequest(), routeCtx())

    expect(response.status).toBe(204)
    expect(mocks.dockerManager.removeContainerDir).toHaveBeenCalledWith(
      'container-1',
      '/workspace/main/sessions/openclaw-session/',
    )
    expect(mocks.dockerManager.removeContainerDir).toHaveBeenCalledWith(
      'container-1',
      '/workspace/main/sessions/pi-session/',
    )
    expect(mocks.prisma.chatSession.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['openclaw-session', 'pi-session'] } },
    })
    expect(mocks.prisma.chatSession.create).not.toHaveBeenCalled()
  })
})
