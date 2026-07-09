import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auditLog: vi.fn(),
  getRuntimeGatewayClient: vi.fn(),
  ensureRegistryInitialized: vi.fn(),
  piClient: {
    request: vi.fn(),
  },
  piLease: {
    release: vi.fn(),
  },
  prisma: {
    resource: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  registry: {
    getConnectedIds: vi.fn(),
    request: vi.fn(),
  },
}))

vi.mock('@/lib/audit', () => ({
  auditLog: mocks.auditLog,
}))

vi.mock('@/lib/chat/runtime-gateway', () => ({
  getRuntimeGatewayClient: mocks.getRuntimeGatewayClient,
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/gateway/registry', () => ({
  ensureRegistryInitialized: mocks.ensureRegistryInitialized,
  registry: mocks.registry,
}))

vi.mock('@/lib/resources/credential-utils', () => ({
  decryptCredential: vi.fn(() => 'secret-key'),
}))

import { POST } from './route'

const thinkingMetadata = {
  reasoning: true,
  compat: { supportedReasoningEfforts: ['low', 'medium', 'xhigh'] },
  thinkingLevelMap: { off: null, minimal: null, high: null, xhigh: 'xhigh' },
}

const piThinkingMetadata = {
  reasoning: true,
  thinkingLevelMap: { off: null, minimal: null, high: null, xhigh: 'xhigh' },
}

function createRequest(body: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/v1/resources/resource-1/push', {
    headers: {
      'content-type': 'application/json',
      'x-user-id': 'user-1',
    },
    method: 'POST',
    body: JSON.stringify({
      modelId: 'claude-sonnet-4-20250514',
      instanceIds: ['instance-1'],
      role: 'primary',
      ...body,
    }),
  })
}

function routeCtx() {
  return { params: Promise.resolve({ id: 'resource-1' }) }
}

describe('resource model push route pi sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
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
    mocks.prisma.resource.findUnique.mockResolvedValue({
      config: {
        apiType: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        models: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }],
      },
      credentials: 'encrypted',
      id: 'resource-1',
      provider: 'anthropic',
      type: 'MODEL',
    })
    mocks.registry.getConnectedIds.mockReturnValue(['instance-1'])
    mocks.registry.request.mockImplementation(async (instanceId, method) => {
      if (instanceId !== 'instance-1') throw new Error('unexpected instance')
      if (method === 'config.get') {
        return { hash: 'hash-1', config: { agents: { defaults: {} } } }
      }
      if (method === 'config.patch') return { ok: true }
      throw new Error(`unexpected method ${method}`)
    })
    mocks.piClient.request.mockResolvedValue({ ok: true })
    mocks.piLease.release.mockReset()
    mocks.getRuntimeGatewayClient.mockResolvedValue({
      ...mocks.piLease,
      client: mocks.piClient,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('pushes pi-compatible provider config to pi-wrapper after OpenClaw config succeeds', async () => {
    const response = await POST(createRequest(), routeCtx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.thinkingLevel).toBe('medium')
    expect(body.outcomes).toEqual([
      expect.objectContaining({ instanceId: 'instance-1', ok: true, piOk: true }),
    ])
    expect(mocks.registry.request).toHaveBeenCalledWith('instance-1', 'config.patch', {
      raw: expect.stringContaining('"agents"'),
      baseHash: 'hash-1',
    })
    const openClawPatch = JSON.parse(mocks.registry.request.mock.calls[1][2].raw)
    expect(openClawPatch.agents.defaults.thinkingDefault).toBe('medium')
    expect(openClawPatch.models.providers.anthropic.models[0]).toMatchObject(thinkingMetadata)
    expect(mocks.getRuntimeGatewayClient).toHaveBeenCalledWith('instance-1', 'pi')
    expect(mocks.piClient.request).toHaveBeenCalledWith('config.patch', {
      models: {
        providers: {
          anthropic: {
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'secret-key',
            api: 'anthropic-messages',
            models: [
              {
                id: 'claude-sonnet-4-20250514',
                name: 'Claude Sonnet 4',
                ...piThinkingMetadata,
              },
            ],
          },
        },
      },
    })
    expect(mocks.piLease.release).toHaveBeenCalled()
  })

  it('uses the selected thinking level for OpenClaw and Pi defaults', async () => {
    const response = await POST(
      createRequest({ targets: ['openclaw', 'pi'], thinkingLevel: 'xhigh' }),
      routeCtx(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.thinkingLevel).toBe('xhigh')
    const openClawPatch = JSON.parse(mocks.registry.request.mock.calls[1][2].raw)
    expect(openClawPatch.agents.defaults.thinkingDefault).toBe('xhigh')
    expect(mocks.piClient.request).toHaveBeenCalledWith('config.patch', {
      models: {
        providers: {
          anthropic: expect.objectContaining({
            api: 'anthropic-messages',
          }),
        },
      },
      settings: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
        defaultThinkingLevel: 'xhigh',
      },
    })
  })

  it('pushes a Pi-only target without patching OpenClaw and sets the Pi default for new sessions', async () => {
    const response = await POST(
      createRequest({
        targets: ['pi'],
        role: undefined,
      }),
      routeCtx(),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.successCount).toBe(1)
    expect(body.outcomes).toEqual([
      expect.objectContaining({ instanceId: 'instance-1', ok: true, piOk: true }),
    ])
    expect(mocks.ensureRegistryInitialized).not.toHaveBeenCalled()
    expect(mocks.registry.request).not.toHaveBeenCalled()
    expect(mocks.piClient.request).toHaveBeenCalledWith('config.patch', {
      models: {
        providers: {
          anthropic: expect.objectContaining({
            api: 'anthropic-messages',
            models: [
              {
                id: 'claude-sonnet-4-20250514',
                name: 'Claude Sonnet 4',
                ...piThinkingMetadata,
              },
            ],
          }),
        },
      },
      settings: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
        defaultThinkingLevel: 'medium',
      },
    })
  })

  it('keeps OpenClaw-only push from changing the Pi default model', async () => {
    const response = await POST(createRequest({ targets: ['openclaw'] }), routeCtx())

    expect(response.status).toBe(200)
    const piPatch = mocks.piClient.request.mock.calls[0]?.[1]
    expect(piPatch).toEqual({
      models: {
        providers: {
          anthropic: expect.objectContaining({
            api: 'anthropic-messages',
          }),
        },
      },
    })
    expect(piPatch.settings).toBeUndefined()
  })

  it('keeps OpenClaw push successful when pi-wrapper sync fails', async () => {
    mocks.piClient.request.mockRejectedValue(new Error('pi-wrapper unavailable'))

    const response = await POST(createRequest(), routeCtx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.successCount).toBe(1)
    expect(body.failedCount).toBe(0)
    expect(body.outcomes).toEqual([
      expect.objectContaining({
        instanceId: 'instance-1',
        ok: true,
        piOk: false,
        piError: 'pi-wrapper unavailable',
      }),
    ])
    expect(mocks.piLease.release).toHaveBeenCalled()
  })

  it('fails the instance outcome when an explicitly requested Pi target fails', async () => {
    mocks.piClient.request.mockRejectedValue(new Error('pi-wrapper unavailable'))

    const response = await POST(createRequest({ targets: ['pi'] }), routeCtx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.successCount).toBe(0)
    expect(body.failedCount).toBe(1)
    expect(body.outcomes).toEqual([
      expect.objectContaining({
        instanceId: 'instance-1',
        ok: false,
        piOk: false,
        piError: 'pi-wrapper unavailable',
      }),
    ])
  })

  it('skips pi sync without failing when the target instance has no pi runtime', async () => {
    mocks.getRuntimeGatewayClient.mockRejectedValue(
      new Error('Pi runtime is not enabled for this instance'),
    )

    const response = await POST(createRequest(), routeCtx())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.successCount).toBe(1)
    expect(body.failedCount).toBe(0)
    expect(body.outcomes).toEqual([expect.objectContaining({ instanceId: 'instance-1', ok: true })])
    expect(body.outcomes[0].piOk).toBeUndefined()
    expect(body.outcomes[0].piError).toBeUndefined()
    expect(mocks.piClient.request).not.toHaveBeenCalled()
  })
})
