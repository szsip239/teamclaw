import { prisma } from '@/lib/db'
import { decryptCredential } from '@/lib/resources/credential-utils'
import { getProvider } from '@/lib/resources/providers'

// OpenClaw's default API type — omit when it matches
const DEFAULT_API_TYPE = 'openai-completions'

interface ProviderModelEntry {
  id: string
  name: string
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
 * Skips ollama (no API key needed), providers without baseUrl, and those
 * without known models (defaultModels in registry).
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

    // models array is required by OpenClaw schema — use registry defaultModels
    const defaultModels = providerDef?.defaultModels
    if (!defaultModels || defaultModels.length === 0) continue

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
      models: defaultModels.map(m => ({ id: m.id, name: m.name })),
    }

    // Set api type only when it differs from OpenClaw's default
    const apiType = (resourceConfig?.apiType as string) || providerDef?.apiType
    if (apiType && apiType !== DEFAULT_API_TYPE) {
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
