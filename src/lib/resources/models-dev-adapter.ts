// models.dev JSON catalog adapter.
//
// Source: https://models.dev/api.json — OpenCode's open-source model registry.
// One HTTP GET returns the entire catalog (~100 providers × their models) with
// structured provider-level metadata: `api`, `env`, `name`, `doc`, `npm`.
//
// This is the canonical upstream for teamclaw's model metadata. Compared to
// LiteLLM (which only exposed model-level JSON), models.dev also gives us
// per-provider api_base and env var names — so we don't need to hardcode
// those in teamclaw's providers.ts.
//
// Network access is required — the target deployment has public internet, so
// no local snapshot fallback is shipped. Failures surface as empty results.

import type { ModelDefinition } from '@/types/resource'

const REGISTRY_URL = 'https://models.dev/api.json'
const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000 // 10 min

// ─── Raw registry types ────────────────────────────────────────────

interface ModelsDevModel {
  id: string
  name: string
  family?: string
  reasoning?: boolean
  tool_call?: boolean
  attachment?: boolean
  modalities?: {
    input?: string[]
    output?: string[]
  }
  cost?: {
    input?: number
    output?: number
    cache_read?: number
    cache_write?: number
  }
  limit?: {
    context?: number
    output?: number
  }
  release_date?: string
  last_updated?: string
  knowledge?: string
  open_weights?: boolean
}

export interface ModelsDevProvider {
  id: string
  name: string
  env?: string[]
  api?: string
  npm?: string
  doc?: string
  models: Record<string, ModelsDevModel>
}

type Registry = Record<string, ModelsDevProvider>

// ─── Cache ─────────────────────────────────────────────────────────

let cached: { data: Registry; fetchedAt: number } | null = null

async function fetchCatalog(ttlMs = DEFAULT_CACHE_TTL_MS): Promise<Registry> {
  if (cached && Date.now() - cached.fetchedAt < ttlMs) {
    return cached.data
  }
  const res = await fetch(REGISTRY_URL, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`models.dev catalog fetch failed: HTTP ${res.status}`)
  }
  const raw = (await res.json()) as Registry
  cached = { data: raw, fetchedAt: Date.now() }
  return raw
}

// ─── Field mapping ─────────────────────────────────────────────────

// models.dev image/vision support is expressed via `modalities.input`
// containing "image". teamclaw's ModelDefinition.input uses the same
// "text" | "image" string literal convention.
function extractInput(modalities: ModelsDevModel['modalities']): string[] | undefined {
  const input = modalities?.input
  if (!input?.length) return undefined
  const normalized = input.filter((m) => m === 'text' || m === 'image')
  return normalized.length > 0 ? normalized : undefined
}

function modelFromEntry(entry: ModelsDevModel): ModelDefinition {
  const def: ModelDefinition = { id: entry.id, name: entry.name }
  if (entry.reasoning !== undefined) def.reasoning = entry.reasoning
  const input = extractInput(entry.modalities)
  if (input) def.input = input
  if (entry.limit?.context) def.contextWindow = entry.limit.context
  if (entry.limit?.output) def.maxTokens = entry.limit.output
  if (entry.cost && (entry.cost.input !== undefined || entry.cost.output !== undefined)) {
    const cost: ModelDefinition['cost'] = {
      input: entry.cost.input ?? 0,
      output: entry.cost.output ?? 0,
    }
    if (entry.cost.cache_read !== undefined) cost.cacheRead = entry.cost.cache_read
    if (entry.cost.cache_write !== undefined) cost.cacheWrite = entry.cost.cache_write
    def.cost = cost
  }
  return def
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Fetch all models for a given models.dev provider id.
 *
 * Example: `getModelsForProvider("alibaba-coding-plan-cn")` → 7 Qwen coding
 * models with id, context, cost, etc.
 */
export async function getModelsForProvider(
  modelsDevId: string,
  options?: { cacheTtlMs?: number },
): Promise<ModelDefinition[]> {
  const catalog = await fetchCatalog(options?.cacheTtlMs)
  const provider = catalog[modelsDevId]
  if (!provider) return []
  return Object.values(provider.models).map(modelFromEntry)
}

/**
 * Return the full provider metadata (name, api, env, models, ...) for a
 * models.dev provider id. Useful for seeding Resource defaults like baseUrl
 * and envVarName when creating a new Resource.
 */
export async function getProviderMeta(
  modelsDevId: string,
  options?: { cacheTtlMs?: number },
): Promise<ModelsDevProvider | null> {
  const catalog = await fetchCatalog(options?.cacheTtlMs)
  return catalog[modelsDevId] ?? null
}

/** Force-clear the in-process cache (tests / admin). */
export function clearCacheForTests(): void {
  cached = null
}
