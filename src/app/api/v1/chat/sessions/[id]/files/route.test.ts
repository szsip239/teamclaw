import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dockerManager: {
    listContainerDir: vi.fn(),
  },
  prisma: {
    chatSession: {
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
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/docker/manager', () => ({
  dockerManager: mocks.dockerManager,
}))

import { GET } from './route'

function createRequest() {
  return new NextRequest(
    'http://localhost/api/v1/chat/sessions/conversation-1/files?zone=output',
    { headers: { 'x-user-id': 'user-1' } },
  )
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
    userId: 'user-1',
  }
}

describe('chat session files route', () => {
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
    mocks.prisma.instance.findUnique.mockResolvedValue({
      containerId: 'container-1',
      id: 'instance-1',
      workspacePath: null,
    })
  })

  it('lists output files from every runtime session in a conversation group', async () => {
    mocks.prisma.chatSession.findUnique.mockResolvedValue(null)
    mocks.prisma.chatSession.findMany.mockResolvedValue([
      sessionRow('openclaw-session'),
      sessionRow('pi-session'),
    ])
    mocks.dockerManager.listContainerDir
      .mockResolvedValueOnce([
        { name: 'openclaw.html', path: 'openclaw.html', size: 10, type: 'file' },
      ])
      .mockResolvedValueOnce([
        { name: 'pi.html', path: 'pi.html', size: 20, type: 'file' },
      ])

    const response = await GET(createRequest(), routeCtx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.files).toEqual([
      {
        name: 'openclaw.html',
        path: 'openclaw.html',
        size: 10,
        sourceSessionId: 'openclaw-session',
        type: 'file',
      },
      {
        name: 'pi.html',
        path: 'pi.html',
        size: 20,
        sourceSessionId: 'pi-session',
        type: 'file',
      },
    ])
  })
})
