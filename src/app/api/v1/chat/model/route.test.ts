import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  client: {
    request: vi.fn(),
  },
  lease: {
    release: vi.fn(),
  },
  getRuntimeGatewayClient: vi.fn(),
  prisma: {
    chatSession: {
      findFirst: vi.fn(),
    },
    instance: {
      findUnique: vi.fn(),
    },
    instanceAccess: {
      findFirst: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/chat/runtime-gateway', () => ({
  getRuntimeGatewayClient: mocks.getRuntimeGatewayClient,
}))

import { GET } from './route'

function request(url: string) {
  return new NextRequest(url, {
    headers: { 'x-user-id': 'user-1' },
    method: 'GET',
  })
}

describe('chat model route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lease.release.mockReset()
    mocks.getRuntimeGatewayClient.mockResolvedValue({
      ...mocks.lease,
      client: mocks.client,
    })
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
      dockerConfig: { hostPiPort: 15345 },
    })
    mocks.prisma.chatSession.findFirst.mockResolvedValue(null)
  })

  it('uses the OpenClaw active session model when fallback pinned the session', async () => {
    mocks.prisma.chatSession.findFirst.mockResolvedValue({
      id: 'session-openclaw',
      isActive: true,
      sessionId: 'agent:telecom:tc:user-1',
    })
    mocks.client.request.mockImplementation(async (method: string) => {
      if (method === 'config.get') {
        return {
          config: {
            agents: { defaults: { model: 'openai/gpt-primary' } },
            models: {
              providers: {
                anthropic: {
                  models: [{ id: 'claude-fallback', name: 'Claude Fallback' }],
                },
              },
            },
          },
        }
      }
      if (method === 'sessions.describe') {
        return {
          session: {
            modelProvider: 'anthropic',
            model: 'claude-fallback',
          },
        }
      }
      if (method === 'agents.list') {
        return { agents: [{ id: 'telecom', model: 'openai/gpt-primary' }] }
      }
      throw new Error(`unexpected method ${method}`)
    })

    const response = await GET(request(
      'http://localhost/api/v1/chat/model?instanceId=inst-1&agentId=telecom&runtime=openclaw&sessionId=group-1',
    ))
    const body = await response.json()

    expect(body.model).toEqual({
      ref: 'anthropic/claude-fallback',
      label: 'Claude Fallback',
      source: 'session',
    })
    expect(mocks.client.request).toHaveBeenCalledWith('sessions.describe', {
      key: 'agent:telecom:tc:user-1',
    })
    expect(mocks.lease.release).toHaveBeenCalled()
  })

  it('uses Pi settings for the Pi runtime model', async () => {
    mocks.client.request.mockImplementation(async (method: string) => {
      if (method !== 'config.get') throw new Error(`unexpected method ${method}`)
      return {
        config: {
          providers: {
            anthropic: {
              models: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }],
            },
          },
        },
        settings: {
          defaultProvider: 'anthropic',
          defaultModel: 'claude-sonnet-4-20250514',
        },
      }
    })

    const response = await GET(request(
      'http://localhost/api/v1/chat/model?instanceId=inst-1&agentId=telecom&runtime=pi',
    ))
    const body = await response.json()

    expect(body.model).toEqual({
      ref: 'anthropic/claude-sonnet-4-20250514',
      label: 'Claude Sonnet 4',
      source: 'pi-settings',
    })
    expect(mocks.client.request).toHaveBeenCalledTimes(1)
    expect(mocks.lease.release).toHaveBeenCalled()
  })
})
