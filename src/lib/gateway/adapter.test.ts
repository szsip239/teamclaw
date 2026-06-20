import { describe, expect, it, vi } from 'vitest'
import { GatewayV1Adapter } from './adapter'
import type { GatewayClient } from './client'

describe('GatewayV1Adapter', () => {
  it('resolves a single agent from agents.list', async () => {
    const request = vi.fn(async (method: string) => {
      if (method !== 'agents.list') throw new Error(`unknown method: ${method}`)
      return {
        defaultId: 'main',
        agents: [
          { id: 'main', name: 'Main', status: 'ready', workspace: '/workspace/main' },
          { id: 'sales', name: 'Sales', status: 'ready', workspace: '/workspace/sales' },
        ],
      }
    })
    const client = { request } as unknown as GatewayClient

    await expect(new GatewayV1Adapter().getAgent(client, 'sales')).resolves.toMatchObject({
      id: 'sales',
      workspace: '/workspace/sales',
    })
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('agents.list')
  })

  it('passes replacePaths through config.patch for intentional array replacement', async () => {
    const request = vi.fn(async () => ({ ok: true }))
    const client = { request } as unknown as GatewayClient

    await new GatewayV1Adapter().patchConfig(
      client,
      { agents: { list: [{ id: 'main', name: 'Main' }] } },
      'hash-1',
      { replacePaths: ['agents.list'] },
    )

    expect(request).toHaveBeenCalledWith('config.patch', {
      raw: JSON.stringify({ agents: { list: [{ id: 'main', name: 'Main' }] } }),
      baseHash: 'hash-1',
      replacePaths: ['agents.list'],
    })
  })
})
