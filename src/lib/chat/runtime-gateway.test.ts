import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const registryClient = { request: vi.fn() }
  const gatewayInstances: Array<{
    url: string
    token: string
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
  }> = []

  function MockGatewayClient(
    this: {
      url: string
      token: string
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    },
    url: string,
    token: string,
  ) {
    this.url = url
    this.token = token
    this.connect = vi.fn(async () => {})
    this.disconnect = vi.fn()
    gatewayInstances.push(this)
  }

  return {
    ensureRegistryInitialized: vi.fn(async () => {}),
    registry: {
      getClient: vi.fn(() => registryClient),
    },
    registryClient,
    prisma: {
      instance: {
        findUnique: vi.fn(),
      },
      chatSession: {
        update: vi.fn(),
      },
    },
    decrypt: vi.fn(() => 'plain-token'),
    GatewayClient: vi.fn(MockGatewayClient),
    gatewayInstances,
  }
})

vi.mock('@/lib/gateway/registry', () => ({
  ensureRegistryInitialized: mocks.ensureRegistryInitialized,
  registry: mocks.registry,
}))

vi.mock('@/lib/db', () => ({
  prisma: mocks.prisma,
}))

vi.mock('@/lib/auth/encryption', () => ({
  decrypt: mocks.decrypt,
}))

vi.mock('@/lib/gateway/client', () => ({
  GatewayClient: mocks.GatewayClient,
}))

import { getRuntimeGatewayClient } from './runtime-gateway'

describe('runtime gateway client leases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.gatewayInstances.length = 0
    mocks.registry.getClient.mockReturnValue(mocks.registryClient)
  })

  it('reuses the registry client for OpenClaw runtime', async () => {
    const lease = await getRuntimeGatewayClient('inst-1', 'openclaw')

    expect(mocks.ensureRegistryInitialized).toHaveBeenCalled()
    expect(mocks.registry.getClient).toHaveBeenCalledWith('inst-1')
    expect(lease?.client).toBe(mocks.registryClient)
    expect(lease?.temporary).toBe(false)
    lease?.release()
    expect(mocks.GatewayClient).not.toHaveBeenCalled()
  })

  it('creates and releases a temporary pi-wrapper client for pi runtime', async () => {
    mocks.prisma.instance.findUnique.mockResolvedValue({
      gatewayToken: 'encrypted',
      dockerConfig: { hostPiPort: 18791 },
      containerName: 'teamclaw-sales',
    })

    const lease = await getRuntimeGatewayClient('inst-1', 'pi')

    expect(mocks.prisma.instance.findUnique).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      select: { gatewayToken: true, dockerConfig: true, containerName: true },
    })
    expect(mocks.GatewayClient).toHaveBeenCalledWith('ws://127.0.0.1:18791', 'plain-token')
    expect(mocks.gatewayInstances[0].connect).toHaveBeenCalled()
    expect(lease?.temporary).toBe(true)

    lease?.release()
    expect(mocks.gatewayInstances[0].disconnect).toHaveBeenCalled()
  })
})
