import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

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

import { prisma } from '@/lib/db'
import {
  buildProviderEntries,
  buildProviderEntryFromResource,
  resolveOpenClawProviderId,
} from './provider-sync'

const findManyMock = prisma.resource.findMany as unknown as Mock

describe('provider sync OpenClaw provider mapping', () => {
  beforeEach(() => {
    findManyMock.mockReset()
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
})
