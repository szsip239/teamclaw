import { prisma } from '@/lib/db'
import { buildProviderEntries, sanitizeProviderPatch } from '@/lib/config-editor/provider-sync'
import type { ConfigGetResult } from '@/types/gateway'

// Tracks which instances have already been auto-initialized in this gateway
// process, to avoid repeating the push on reconnects.
const initialized = new Set<string>()

/**
 * Push default MODEL Resources to a freshly-connected instance that has no
 * providers configured yet. Guardrails:
 *   1. Only runs once per instanceId per process (tracked in-memory).
 *   2. Only fires when the instance's live `models.providers` block is empty.
 *   3. Only writes `agents.defaults.model.primary` when it's currently unset —
 *      never overwrites an existing primary the user configured manually.
 *
 * For the primary seed we pick the Resource flagged `isDefaultModel=true`
 * (at most one per provider by API-level invariant). Its `config.defaultModelId`
 * is combined with the provider id to form the `<provider>/<modelId>` ref.
 */
export async function initInstanceWithDefaultResources(instanceId: string): Promise<void> {
  if (initialized.has(instanceId)) return

  // Dynamic import to dodge the registry ⇄ provider-sync circular dep
  const { registry } = await import('@/lib/gateway/registry')

  if (!registry.isConnected(instanceId)) return

  let current: ConfigGetResult
  try {
    current = (await registry.request(instanceId, 'config.get')) as ConfigGetResult
  } catch (err) {
    console.warn(`[instance-init] config.get failed for ${instanceId}:`, (err as Error).message)
    return
  }

  const existingProviders =
    (current.config?.models as Record<string, unknown> | undefined)?.providers as
      | Record<string, unknown>
      | undefined
  // Guardrail 2: bail if any provider is already configured
  if (existingProviders && Object.keys(existingProviders).length > 0) {
    initialized.add(instanceId)
    return
  }

  const defaults = await prisma.resource.findMany({
    where: { type: 'MODEL', isDefault: true, status: { not: 'ERROR' } },
    select: { provider: true, isDefaultModel: true, config: true },
  })
  if (defaults.length === 0) {
    initialized.add(instanceId)
    return
  }

  const providerIds = [...new Set(defaults.map((r) => r.provider))]
  const entries = await buildProviderEntries(providerIds)
  if (Object.keys(entries).length === 0) {
    initialized.add(instanceId)
    return
  }

  // Build the patch: models.providers + optional agents.defaults.model.primary
  const patch: Record<string, unknown> = {
    models: { mode: 'merge', providers: entries },
  }

  // Guardrail 3: only seed primary if the instance has none configured
  const currentAgents = current.config?.agents as Record<string, unknown> | undefined
  const currentDefaults = currentAgents?.defaults as Record<string, unknown> | undefined
  const currentModel = currentDefaults?.model
  const hasPrimary =
    (typeof currentModel === 'string' && currentModel.length > 0) ||
    (currentModel !== null &&
      typeof currentModel === 'object' &&
      !!(currentModel as Record<string, unknown>).primary)

  if (!hasPrimary) {
    const primarySeed = defaults.find((r) => {
      if (!r.isDefaultModel) return false
      const cfg = r.config as { defaultModelId?: string } | null
      return !!cfg?.defaultModelId
    })
    if (primarySeed) {
      const cfg = primarySeed.config as { defaultModelId?: string }
      patch.agents = {
        defaults: { model: `${primarySeed.provider}/${cfg.defaultModelId}` },
      }
    }
  }

  const sanitized = sanitizeProviderPatch(patch)

  try {
    await registry.request(instanceId, 'config.patch', {
      raw: JSON.stringify(sanitized),
      baseHash: current.hash,
    })
    initialized.add(instanceId)
    console.log(
      `[instance-init] seeded ${instanceId} with providers=${providerIds.join(',')}` +
        (patch.agents ? ' + primary' : ''),
    )
  } catch (err) {
    console.warn(`[instance-init] patch failed for ${instanceId}:`, (err as Error).message)
  }
}

/** Reset the in-memory initialization flag — mainly for tests / manual re-seed. */
export function resetInitTracker(instanceId?: string): void {
  if (instanceId) initialized.delete(instanceId)
  else initialized.clear()
}
