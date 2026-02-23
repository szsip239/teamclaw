import { GatewayClient } from './client'
import { type GatewayAdapter, resolveAdapter } from './adapter'
import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/auth/encryption'
import type { ConfigGetResult, ConfigSchemaResult } from '@/types/gateway'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface ManagedInstance {
  client: GatewayClient
  instanceId: string
  status: ConnectionStatus
}

const globalForRegistry = globalThis as unknown as { gatewayRegistry: GatewayRegistry }

export class GatewayRegistry {
  private instances = new Map<string, ManagedInstance>()

  async connect(instanceId: string, url: string, token: string): Promise<void> {
    // If already connected, disconnect first
    if (this.instances.has(instanceId)) {
      await this.disconnect(instanceId)
    }

    const client = new GatewayClient(url, token)
    const managed: ManagedInstance = { client, instanceId, status: 'connecting' }

    client.onStatusChange = (status) => {
      managed.status = status
    }

    client.onPermanentDisconnect = () => {
      managed.status = 'error'
      // Update DB status to ERROR (fire-and-forget)
      prisma.instance.update({
        where: { id: instanceId },
        data: { status: 'ERROR' },
      }).catch(console.error)
    }

    this.instances.set(instanceId, managed)
    await client.connect()
  }

  async disconnect(instanceId: string): Promise<void> {
    const managed = this.instances.get(instanceId)
    if (managed) {
      managed.client.disconnect()
      this.instances.delete(instanceId)
    }
  }

  getClient(instanceId: string): GatewayClient | undefined {
    return this.instances.get(instanceId)?.client
  }

  getAdapter(instanceId: string): GatewayAdapter | undefined {
    if (!this.instances.has(instanceId)) return undefined
    // Create fresh adapter to avoid stale class references from hot-reload
    return resolveAdapter()
  }

  getStatus(instanceId: string): ConnectionStatus | undefined {
    return this.instances.get(instanceId)?.status
  }

  getServerVersion(instanceId: string): string | null {
    return this.instances.get(instanceId)?.client.serverVersion ?? null
  }

  async request(instanceId: string, method: string, params?: Record<string, unknown>): Promise<unknown> {
    const client = this.getClient(instanceId)
    if (!client) {
      throw new Error(`Instance ${instanceId} is not connected`)
    }
    return client.request(method, params)
  }

  async getConfig(instanceId: string): Promise<ConfigGetResult> {
    const adapter = this.getAdapter(instanceId)
    const client = this.getClient(instanceId)
    if (!adapter || !client) {
      throw new Error(`Instance ${instanceId} is not connected`)
    }
    return adapter.getConfig(client)
  }

  async getSchema(instanceId: string): Promise<ConfigSchemaResult> {
    const adapter = this.getAdapter(instanceId)
    const client = this.getClient(instanceId)
    if (!adapter || !client) {
      throw new Error(`Instance ${instanceId} is not connected`)
    }
    return adapter.getSchema(client)
  }

  async patchConfig(
    instanceId: string,
    patch: Record<string, unknown>,
    baseHash: string,
  ): Promise<void> {
    const adapter = this.getAdapter(instanceId)
    const client = this.getClient(instanceId)
    if (!adapter || !client) {
      throw new Error(`Instance ${instanceId} is not connected`)
    }
    await adapter.patchConfig(client, patch, baseHash)
  }

  async checkHealth(instanceId: string): Promise<unknown> {
    const adapter = this.getAdapter(instanceId)
    const client = this.getClient(instanceId)
    if (!adapter || !client) {
      throw new Error(`Instance ${instanceId} is not connected`)
    }
    return adapter.getHealth(client)
  }

  isConnected(instanceId: string): boolean {
    return this.instances.get(instanceId)?.client.isConnected() ?? false
  }

  getConnectedIds(): string[] {
    return Array.from(this.instances.entries())
      .filter(([, m]) => m.status === 'connected')
      .map(([id]) => id)
  }

  async disconnectAll(): Promise<void> {
    const ids = Array.from(this.instances.keys())
    await Promise.all(ids.map(id => this.disconnect(id)))
  }
}

export const registry =
  globalForRegistry.gatewayRegistry ||
  (globalForRegistry.gatewayRegistry = new GatewayRegistry())

// Lazy initialization: restore connections for all non-DISABLED instances.
// ERROR/OFFLINE instances are included because the container may have restarted
// since the status was set — skipping them would leave them stuck forever.
let initialized = false
export async function ensureRegistryInitialized(): Promise<void> {
  if (initialized) return
  initialized = true

  try {
    const instances = await prisma.instance.findMany()

    await Promise.allSettled(
      instances.map(async (inst) => {
        try {
          await registry.connect(inst.id, inst.gatewayUrl, decrypt(inst.gatewayToken))
          // Connection succeeded — if instance was ERROR/OFFLINE, mark as DEGRADED
          // so the health check cycle can promote it to ONLINE on next success.
          if (inst.status === 'ERROR' || inst.status === 'OFFLINE') {
            await prisma.instance.update({
              where: { id: inst.id },
              data: { status: 'DEGRADED' },
            }).catch(console.error)
          }
        } catch (err) {
          console.error(`Failed to restore connection for instance ${inst.id}:`, err)
          // Only downgrade ONLINE/DEGRADED → ERROR; leave ERROR/OFFLINE as-is
          if (inst.status === 'ONLINE' || inst.status === 'DEGRADED') {
            await prisma.instance.update({
              where: { id: inst.id },
              data: { status: 'ERROR' },
            }).catch(console.error)
          }
        }
      })
    )
  } catch (err) {
    console.error('Failed to initialize gateway registry:', err)
  }

  // Start health checks + recovery in background (lazy import to avoid circular deps)
  import('./health').then(({ ensureHealthChecks }) =>
    ensureHealthChecks().catch(console.error),
  )
}
