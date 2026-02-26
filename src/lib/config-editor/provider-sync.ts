import { prisma } from '@/lib/db'
import { decryptCredential } from '@/lib/resources/credential-utils'
import { getProvider } from '@/lib/resources/providers'

// OpenClaw's default API type — omit when it matches
const DEFAULT_API_TYPE = 'openai-completions'

interface ProviderModelEntry {
  id: string
  name: string
  reasoning?: boolean
  input?: string[]
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  contextWindow?: number
  maxTokens?: number
}

interface ProviderEntry {
  baseUrl: string
  apiKey: string
  api?: string
  models: ProviderModelEntry[]
}

/**
 * Look up Resources in DB for the given provider IDs, decrypt their API keys,
 * and build OpenClaw-compatible provider entries.
 *
 * OpenClaw schema requires: { baseUrl (required), models (required), apiKey, api, ... }
 *
 * For each provider ID, picks the best Resource (isDefault > ACTIVE > newest).
 * Models are resolved from: registry defaultModels → resource config.models
 * (the latter supports custom/opencode providers whose models come from DB).
 * Skips ollama (no API key needed), providers without baseUrl, and those
 * without any resolvable models.
 */
export async function buildProviderEntries(
  providerIds: string[],
): Promise<Record<string, ProviderEntry>> {
  if (providerIds.length === 0) return {}

  // Batch query all matching MODEL resources, excluding ERROR status
  const resources = await prisma.resource.findMany({
    where: {
      provider: { in: providerIds },
      type: 'MODEL',
      status: { not: 'ERROR' },
    },
    orderBy: [
      { isDefault: 'desc' },
      { status: 'asc' },    // ACTIVE < UNTESTED alphabetically
      { updatedAt: 'desc' },
    ],
    select: {
      provider: true,
      credentials: true,
      config: true,
    },
  })

  // Group by provider, take first (best) per provider
  const bestByProvider = new Map<string, typeof resources[number]>()
  for (const r of resources) {
    if (!bestByProvider.has(r.provider)) {
      bestByProvider.set(r.provider, r)
    }
  }

  const entries: Record<string, ProviderEntry> = {}

  for (const [providerId, resource] of bestByProvider) {
    const providerDef = getProvider(providerId)

    // Skip ollama — no API key needed
    if (providerDef?.apiType === 'ollama') continue

    // baseUrl is required by OpenClaw schema
    const resourceConfig = resource.config as Record<string, unknown> | null
    const baseUrl = (resourceConfig?.baseUrl as string) || providerDef?.baseUrl
    if (!baseUrl) continue

    // models array is required by OpenClaw schema
    // Priority: registry defaultModels → resource config models (custom/opencode providers)
    const registryModels = providerDef?.defaultModels
    const resourceModels = resourceConfig?.models as ProviderModelEntry[] | undefined
    const models = (registryModels && registryModels.length > 0)
      ? registryModels
      : (resourceModels && resourceModels.length > 0 ? resourceModels : null)
    if (!models) continue

    // Decrypt API key
    let apiKey: string
    try {
      apiKey = decryptCredential(resource.credentials)
    } catch {
      continue
    }

    const entry: ProviderEntry = {
      baseUrl,
      apiKey,
      models: models.map(m => {
        const entry: ProviderModelEntry = { id: m.id, name: m.name }
        if (m.reasoning !== undefined) entry.reasoning = m.reasoning
        if (m.input) entry.input = m.input
        if (m.cost) entry.cost = m.cost
        if (m.contextWindow !== undefined) entry.contextWindow = m.contextWindow
        if (m.maxTokens !== undefined) entry.maxTokens = m.maxTokens
        return entry
      }),
    }

    // Set api type — always include for custom/unknown providers (OpenClaw can't infer),
    // omit only for well-known providers using the default type
    const apiType = (resourceConfig?.apiType as string) || providerDef?.apiType
    const isWellKnown = providerDef && providerDef.id !== 'custom' && providerDef.id !== 'opencode'
    if (apiType && (!isWellKnown || apiType !== DEFAULT_API_TYPE)) {
      entry.api = apiType
    }

    entries[providerId] = entry
  }

  return entries
}

/**
 * Merge provider entries into an existing patch object.
 * Does NOT overwrite providers already present in the patch
 * (user manual edits take priority).
 */
export function mergeProvidersIntoPatch(
  patch: Record<string, unknown>,
  entries: Record<string, ProviderEntry>,
): Record<string, unknown> {
  if (Object.keys(entries).length === 0) return patch

  const result = structuredClone(patch)

  // Ensure models.providers path exists
  if (!result.models || typeof result.models !== 'object') {
    result.models = {}
  }
  const models = result.models as Record<string, unknown>

  if (!models.providers || typeof models.providers !== 'object') {
    models.providers = {}
  }
  const providers = models.providers as Record<string, unknown>

  // Inject entries, skipping already-present providers
  for (const [id, entry] of Object.entries(entries)) {
    if (!(id in providers)) {
      providers[id] = entry
    }
  }

  return result
}
