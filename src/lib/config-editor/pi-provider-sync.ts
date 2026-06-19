import { getRuntimeGatewayClient } from '@/lib/chat/runtime-gateway'
import { buildPiModelsPatchFromEntries } from './pi-models-translator'
import type { ProviderEntry } from './provider-sync'

export interface PiProviderSyncResult {
  ok?: boolean
  skipped?: boolean
  error?: string
}

export async function syncPiProviderConfig(params: {
  instanceId: string
  entries: Record<string, ProviderEntry>
  defaultProviderId?: string
  defaultModelId?: string
}): Promise<PiProviderSyncResult> {
  if (Object.keys(params.entries).length === 0) return { skipped: true }

  let lease: Awaited<ReturnType<typeof getRuntimeGatewayClient>> | null = null
  try {
    lease = await getRuntimeGatewayClient(params.instanceId, 'pi')
    if (!lease) return { skipped: true }

    await lease.client.request(
      'config.patch',
      buildPiModelsPatchFromEntries(params.entries, {
        defaultProviderId: params.defaultProviderId,
        defaultModelId: params.defaultModelId,
      }) as unknown as Record<string, unknown>,
    )
    return { ok: true }
  } catch (err) {
    const message = (err as Error).message ?? 'unknown'
    if (message.includes('Pi runtime is not enabled')) return { skipped: true }
    return { ok: false, error: message }
  } finally {
    lease?.release()
  }
}
