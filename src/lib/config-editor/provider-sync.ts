import { prisma } from '@/lib/db'
import { decryptCredential } from '@/lib/resources/credential-utils'
import { getProvider } from '@/lib/resources/providers'
import {
  normalizeProviderBaseUrl,
  normalizeResourceConfigForProvider,
} from '@/lib/resources/config-normalization'
import { syncPiProviderConfig } from './pi-provider-sync'
import type { ResourceConfig } from '@/types/resource'

// ─── Google provider baseUrl fix ─────────────────────────────────────
// pi-ai's Google provider createClient() sets apiVersion="" when baseUrl
// is present, assuming the URL already includes the version path. But the
// bare default endpoint doesn't include /v1beta, causing 404 errors for
// preview models. Fix: append /v1beta so the full path is correct.
const GOOGLE_GENAI_BARE_ENDPOINT = 'https://generativelanguage.googleapis.com'
const GOOGLE_GENAI_PROVIDER_IDS = new Set(['google', 'google-gemini-cli'])

function fixGoogleProviderBaseUrl(providerId: string, baseUrl: string, apiType?: string): string {
  const isGoogleGenAI =
    GOOGLE_GENAI_PROVIDER_IDS.has(providerId) || apiType === 'google-generative-ai'
  if (!isGoogleGenAI) return baseUrl

  const normalized = baseUrl.replace(/\/+$/, '')
  if (normalized === GOOGLE_GENAI_BARE_ENDPOINT) {
    return `${GOOGLE_GENAI_BARE_ENDPOINT}/v1beta`
  }
  return baseUrl
}

export function resolveOpenClawProviderId(
  providerId: string,
  resourceConfig?: ResourceConfig | null,
): string {
  if (providerId === 'doubao') {
    const normalizedConfig = normalizeResourceConfigForProvider(providerId, resourceConfig)
    const baseUrl = normalizedConfig?.baseUrl ?? ''
    if (baseUrl.includes('/api/plan')) {
      return 'volcengine-agent-plan'
    }
    if (baseUrl.includes('/api/coding')) {
      return 'volcengine-plan'
    }
    if (baseUrl.includes('ark.cn-beijing.volces.com/api/v3')) {
      return 'volcengine'
    }
  }

  const explicit = resourceConfig?.openClawProviderId
  if (typeof explicit === 'string' && explicit.length > 0) return explicit

  if (providerId === 'doubao') {
    return 'volcengine'
  }

  return providerId
}

/**
 * Sanitize models.providers in a config patch to fix known compatibility
 * issues before sending to the gateway. Currently handles:
 * - Google provider: appends /v1beta to bare default endpoint
 */
export function sanitizeProviderPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const models = patch.models as Record<string, unknown> | undefined
  if (!models?.providers || typeof models.providers !== 'object') return patch

  const providers = models.providers as Record<string, unknown>
  let cloned = false

  for (const [id, provider] of Object.entries(providers)) {
    if (!provider || typeof provider !== 'object') continue
    const p = provider as Record<string, unknown>
    if (typeof p.baseUrl !== 'string') continue

    const fixed = fixGoogleProviderBaseUrl(id, p.baseUrl, p.api as string | undefined)
    if (fixed !== p.baseUrl) {
      if (!cloned) {
        patch = structuredClone(patch)
        cloned = true
      }
      const cp = (patch.models as Record<string, unknown>).providers as Record<
        string,
        Record<string, unknown>
      >
      cp[id].baseUrl = fixed
    }
  }

  return patch
}

interface ProviderModelEntry {
  id: string
  name: string
  reasoning?: boolean
  input?: string[]
  cost?: { input: number; output: number; cacheRead?: number; cacheWrite?: number }
  contextWindow?: number
  maxTokens?: number
}

export interface ProviderEntry {
  baseUrl: string
  apiKey: string
  api?: string
  models: ProviderModelEntry[]
}

interface ProviderResource {
  provider: string
  credentials: string
  config: unknown
}

export function buildProviderEntryFromResource(resource: ProviderResource): {
  providerId: string
  entry: ProviderEntry
} | null {
  const providerDef = getProvider(resource.provider)

  // Skip ollama — no API key needed
  if (providerDef?.apiType === 'ollama') return null

  // baseUrl is required by OpenClaw schema
  const resourceConfig = normalizeResourceConfigForProvider(
    resource.provider,
    resource.config as ResourceConfig | null,
  )
  const effectiveProviderId = resolveOpenClawProviderId(resource.provider, resourceConfig)
  const rawBaseUrl = resourceConfig?.baseUrl || providerDef?.baseUrl
  const baseUrl = rawBaseUrl
    ? normalizeProviderBaseUrl(
        resource.provider,
        rawBaseUrl,
        resourceConfig?.apiType || providerDef?.apiType,
      )
    : rawBaseUrl
  if (!baseUrl) return null

  // models array is required by OpenClaw schema
  // Priority: resource config models (user-configured) → registry defaultModels (built-in fallback)
  const registryModels = providerDef?.defaultModels
  const resourceModels = resourceConfig?.models as ProviderModelEntry[] | undefined
  const models =
    resourceModels && resourceModels.length > 0
      ? resourceModels
      : registryModels && registryModels.length > 0
        ? registryModels
        : null
  if (!models) return null

  // Decrypt API key
  let apiKey: string
  try {
    apiKey = decryptCredential(resource.credentials)
  } catch {
    return null
  }

  const apiType = resourceConfig?.apiType || providerDef?.apiType
  const entry: ProviderEntry = {
    baseUrl: fixGoogleProviderBaseUrl(resource.provider, baseUrl, apiType),
    apiKey,
    models: models.map((m) => {
      const modelEntry: ProviderModelEntry = { id: m.id, name: m.name }
      if (m.reasoning !== undefined) modelEntry.reasoning = m.reasoning
      if (m.input) modelEntry.input = m.input
      if (m.cost) modelEntry.cost = m.cost
      if (m.contextWindow !== undefined) modelEntry.contextWindow = m.contextWindow
      if (m.maxTokens !== undefined) modelEntry.maxTokens = m.maxTokens
      return modelEntry
    }),
  }

  // Always include api type in the pushed entry, even when it equals the default
  // "openai-completions". Leaving it off causes the OpenClaw provider plugin's
  // config-driven normalize path to leave `api` null in models.json, which in
  // turn routes requests to the wrong endpoint and returns 404. Verified 2026-04-19.
  if (apiType) {
    entry.api = apiType
  }

  return { providerId: effectiveProviderId, entry }
}

/**
 * Look up Resources in DB for the given provider IDs, decrypt their API keys,
 * and build OpenClaw-compatible provider entries.
 *
 * OpenClaw schema requires: { baseUrl (required), models (required), apiKey, api, ... }
 *
 * For each effective OpenClaw provider ID, picks the best Resource
 * (isDefault > ACTIVE > newest). This lets a single TeamClaw provider such as
 * doubao contribute multiple OpenClaw providers: volcengine, volcengine-plan,
 * and volcengine-agent-plan.
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
      { status: 'asc' }, // ACTIVE < UNTESTED alphabetically
      { updatedAt: 'desc' },
    ],
    select: {
      provider: true,
      credentials: true,
      config: true,
    },
  })

  const entries: Record<string, ProviderEntry> = {}

  for (const resource of resources) {
    const built = buildProviderEntryFromResource(resource)
    if (!built) continue
    if (entries[built.providerId]) continue

    entries[built.providerId] = built.entry
  }

  return entries
}

/**
 * Merge provider entries into an existing patch object.
 *
 * User-supplied patch fields take priority over Resource DB entries —
 * explicit edits (including explicit apiKey changes) are preserved.
 *
 * **SecretRef protection**: only skip the Resource DB apiKey when the user's
 * patch carries an actual SecretRef object (e.g. `{source:"env", id:"OPENAI_KEY"}`).
 * If the user didn't set apiKey at all, we must push the plaintext key — OpenClaw
 * schema requires apiKey on `models.providers.<id>`, and without it auth fails
 * (`No API key found for provider`). Verified 2026-04-19.
 */
export function mergeProvidersIntoPatch(
  patch: Record<string, unknown>,
  entries: Record<string, ProviderEntry>,
): Record<string, unknown> {
  if (Object.keys(entries).length === 0) return patch

  const result = structuredClone(patch)

  if (!result.models || typeof result.models !== 'object') {
    result.models = {}
  }
  const models = result.models as Record<string, unknown>

  if (!models.providers || typeof models.providers !== 'object') {
    models.providers = {}
  }
  const providers = models.providers as Record<string, unknown>

  for (const [id, entry] of Object.entries(entries)) {
    const userFields = (providers[id] as Record<string, unknown> | undefined) ?? {}
    const userApiKey = userFields.apiKey
    // Protect only when user set a SecretRef object — undefined / plain-string
    // values mean the user didn't configure auth, so the Resource DB key must win.
    const userHasSecretRef = userApiKey !== null && typeof userApiKey === 'object'
    const base: Partial<ProviderEntry> = { ...entry }
    if (userHasSecretRef) {
      delete base.apiKey
    }
    providers[id] = { ...base, ...userFields }
  }

  return result
}

/**
 * Push updated provider config to all connected instances that reference it.
 * Called after resource update (fire-and-forget from API handler).
 */
export async function syncProviderToInstances(providerId: string): Promise<void> {
  // Build latest provider entry from Resource DB
  const entries = await buildProviderEntries([providerId])
  if (Object.keys(entries).length === 0) return

  // Dynamic import to avoid circular dependency (provider-sync → registry)
  const { registry, ensureRegistryInitialized } = await import('@/lib/gateway/registry')
  await ensureRegistryInitialized()

  const connectedIds = registry.getConnectedIds()
  if (connectedIds.length === 0) return

  // Push to each instance that already uses this provider
  const results = await Promise.allSettled(
    connectedIds.map(async (instanceId) => {
      const configResult = (await registry.request(instanceId, 'config.get')) as {
        config?: Record<string, unknown>
        hash?: string
      }
      const providers = (configResult.config?.models as Record<string, unknown>)?.providers as
        | Record<string, unknown>
        | undefined
      if (!providers) return

      const patchProviders = Object.fromEntries(
        Object.entries(entries).filter(([id]) => id in providers || providerId in providers),
      )
      if (Object.keys(patchProviders).length === 0) return

      const patch = { models: { providers: patchProviders } }
      await registry.request(instanceId, 'config.patch', {
        raw: JSON.stringify(patch),
        baseHash: configResult.hash,
      })
      const piResult = await syncPiProviderConfig({
        instanceId,
        entries: patchProviders as Record<string, ProviderEntry>,
      })
      if (piResult.ok === false) {
        console.warn(
          `[resource-sync] Failed to sync pi provider config to ${instanceId}:`,
          piResult.error,
        )
      }
      console.log(
        `[resource-sync] Synced provider "${Object.keys(patchProviders).join(',')}" to instance ${instanceId}`,
      )
    }),
  )

  for (const [i, r] of results.entries()) {
    if (r.status === 'rejected') {
      console.warn(
        `[resource-sync] Failed to sync to ${connectedIds[i]}:`,
        (r.reason as Error)?.message,
      )
    }
  }
}
