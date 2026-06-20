import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const mocks = vi.hoisted(() => ({
  ensureRegistryInitialized: vi.fn(),
  getRuntimeGatewayClient: vi.fn(),
  piClient: {
    request: vi.fn(),
  },
  piLease: {
    release: vi.fn(),
  },
  registry: {
    getConnectedIds: vi.fn(),
    request: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    resource: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/resources/credential-utils', () => ({
  decryptCredential: vi.fn(() => 'test-key'),
}))

vi.mock('@/lib/gateway/registry', () => ({
  ensureRegistryInitialized: mocks.ensureRegistryInitialized,
  registry: mocks.registry,
}))

vi.mock('@/lib/chat/runtime-gateway', () => ({
  getRuntimeGatewayClient: mocks.getRuntimeGatewayClient,
}))

import { prisma } from '@/lib/db'
import {
  buildProviderEntries,
  buildProviderEntryFromResource,
  resolveOpenClawProviderId,
  syncProviderToInstances,
} from './provider-sync'

const findManyMock = prisma.resource.findMany as unknown as Mock

describe('provider sync OpenClaw provider mapping', () => {
  beforeEach(() => {
    findManyMock.mockReset()
    vi.clearAllMocks()
  })

  it('maps TeamClaw doubao coding resources to OpenClaw volcengine-plan refs', () => {
    expect(
      resolveOpenClawProviderId('doubao', {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      }),
    ).toBe('volcengine-plan')
  })

  it('maps TeamClaw doubao agent plan resources to a custom OpenClaw provider', () => {
    expect(
      resolveOpenClawProviderId('doubao', {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
      }),
    ).toBe('volcengine-agent-plan')
  })

  it('lets the current doubao baseUrl override a stale stored provider id', () => {
    expect(
      resolveOpenClawProviderId('doubao', {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        openClawProviderId: 'volcengine-plan',
      }),
    ).toBe('volcengine')
  })

  it('builds a volcengine-plan provider entry for doubao Coding Plan resources', async () => {
    findManyMock.mockResolvedValue([
      {
        provider: 'doubao',
        credentials: 'encrypted',
        config: {
          baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
          apiType: 'openai-completions',
          models: [{ id: 'ark-code-latest', name: 'Ark Coding Plan' }],
        },
      },
    ])

    const entries = await buildProviderEntries(['doubao'])

    expect(entries.doubao).toBeUndefined()
    expect(entries['volcengine-plan']).toEqual({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3',
      apiKey: 'test-key',
      api: 'openai-completions',
      models: [{ id: 'ark-code-latest', name: 'Ark Coding Plan' }],
    })
  })

  it('builds a volcengine-agent-plan provider entry for doubao Agent Plan resources', async () => {
    findManyMock.mockResolvedValue([
      {
        provider: 'doubao',
        credentials: 'encrypted',
        config: {
          baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
          apiType: 'openai-completions',
          models: [{ id: 'doubao-seed-2.0-code', name: 'Doubao Seed 2.0 Code' }],
        },
      },
    ])

    const entries = await buildProviderEntries(['doubao'])

    expect(entries.doubao).toBeUndefined()
    expect(entries['volcengine-agent-plan']).toEqual({
      baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
      apiKey: 'test-key',
      api: 'openai-completions',
      models: [{ id: 'doubao-seed-2.0-code', name: 'Doubao Seed 2.0 Code' }],
    })
  })

  it('keeps multiple doubao variants as separate OpenClaw providers', async () => {
    findManyMock.mockResolvedValue([
      {
        provider: 'doubao',
        credentials: 'encrypted',
        config: {
          baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
          apiType: 'openai-completions',
          models: [{ id: 'doubao-seed-1-8-251228', name: 'Doubao Seed 1.8' }],
        },
      },
      {
        provider: 'doubao',
        credentials: 'encrypted',
        config: {
          baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
          apiType: 'openai-completions',
          models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
        },
      },
    ])

    const entries = await buildProviderEntries(['doubao'])

    expect(Object.keys(entries).sort()).toEqual(['volcengine', 'volcengine-agent-plan'])
  })

  it('builds provider entries from the exact resource being pushed', () => {
    const built = buildProviderEntryFromResource({
      provider: 'doubao',
      credentials: 'encrypted',
      config: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
        apiType: 'openai-completions',
        models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
      },
    })

    expect(built).toEqual({
      providerId: 'volcengine-agent-plan',
      entry: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan/v3',
        apiKey: 'test-key',
        api: 'openai-completions',
        models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
      },
    })
  })

  it('normalizes bare agent plan baseUrl when building provider entries', () => {
    const built = buildProviderEntryFromResource({
      provider: 'doubao',
      credentials: 'encrypted',
      config: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan',
        apiType: 'openai-completions',
        models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
      },
    })

    expect(built?.providerId).toBe('volcengine-agent-plan')
    expect(built?.entry.baseUrl).toBe('https://ark.cn-beijing.volces.com/api/plan/v3')
  })

  it('keeps bare agent plan baseUrl for anthropic-compatible provider entries', () => {
    const built = buildProviderEntryFromResource({
      provider: 'doubao',
      credentials: 'encrypted',
      config: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan',
        apiType: 'anthropic-messages',
        envVarName: 'ARK_CODING_API_KEY',
        models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
      },
    })

    expect(built).toMatchObject({
      providerId: 'volcengine-agent-plan',
      entry: {
        baseUrl: 'https://ark.cn-beijing.volces.com/api/plan',
        api: 'anthropic-messages',
        models: [{ id: 'doubao-seed-2.0-pro', name: 'Doubao Seed 2.0 Pro' }],
      },
    })
  })

  it('auto-syncs Pi provider config without changing the Pi default model', async () => {
    findManyMock.mockResolvedValue([
      {
        provider: 'anthropic',
        credentials: 'encrypted',
        config: {
          baseUrl: 'https://api.anthropic.com',
          apiType: 'anthropic',
          models: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }],
        },
      },
    ])
    mocks.registry.getConnectedIds.mockReturnValue(['instance-1'])
    mocks.registry.request.mockImplementation(async (_instanceId, method) => {
      if (method === 'config.get') {
        return {
          hash: 'hash-1',
          config: { models: { providers: { anthropic: {} } } },
        }
      }
      if (method === 'config.patch') return { ok: true }
      throw new Error(`unexpected method ${method}`)
    })
    mocks.getRuntimeGatewayClient.mockResolvedValue({
      ...mocks.piLease,
      client: mocks.piClient,
      temporary: true,
    })
    mocks.piClient.request.mockResolvedValue({ ok: true })

    await syncProviderToInstances('anthropic')

    expect(mocks.registry.request).toHaveBeenCalledWith('instance-1', 'config.patch', {
      raw: expect.stringContaining('"anthropic"'),
      baseHash: 'hash-1',
    })
    expect(mocks.getRuntimeGatewayClient).toHaveBeenCalledWith('instance-1', 'pi')
    expect(mocks.piClient.request).toHaveBeenCalledWith('config.patch', {
      models: {
        providers: {
          anthropic: {
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'test-key',
            api: 'anthropic-messages',
            models: [{ id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' }],
          },
        },
      },
    })
    expect(mocks.piClient.request.mock.calls[0][1].settings).toBeUndefined()
    expect(mocks.piLease.release).toHaveBeenCalled()
  })
})
