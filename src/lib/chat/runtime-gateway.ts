import { Prisma } from '@/generated/prisma'
import { decrypt } from '@/lib/auth/encryption'
import { prisma } from '@/lib/db'
import { GatewayClient } from '@/lib/gateway/client'
import { ensureRegistryInitialized, registry } from '@/lib/gateway/registry'
import { instanceSupportsPiRuntime, type ChatRuntime } from '@/lib/chat/runtime'
import { resolvePiGatewayUrl } from '@/lib/chat/pi-runtime-gateway'

export interface RuntimeGatewayClientLease {
  client: GatewayClient
  release: () => void
}

export async function getRuntimeGatewayClient(
  instanceId: string,
  runtime: ChatRuntime,
): Promise<RuntimeGatewayClientLease | null> {
  if (runtime === 'openclaw') {
    await ensureRegistryInitialized()
    const client = registry.getClient(instanceId)
    return client ? { client, release: () => {} } : null
  }

  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: {
      gatewayToken: true,
      dockerConfig: true,
      containerName: true,
    },
  })
  if (!instance) return null
  if (!instanceSupportsPiRuntime(instance.dockerConfig)) {
    throw new Error('Pi runtime is not enabled for this instance')
  }

  const client = new GatewayClient(resolvePiGatewayUrl(instance), decrypt(instance.gatewayToken))
  await client.connect()
  return {
    client,
    release: () => client.disconnect(),
  }
}

export async function markSessionInactive(sessionId: string): Promise<void> {
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { isActive: false, liveMessages: Prisma.DbNull },
  })
}
