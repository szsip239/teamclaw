import type { ChatRuntime } from './runtime'

export type ChatModelSource =
  | 'session'
  | 'agent'
  | 'default'
  | 'pi-settings'
  | 'unknown'

export interface ChatModelSummary {
  ref: string
  label: string
  source: ChatModelSource
}

interface ModelRef {
  provider: string
  model: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function splitModelRef(ref: string | undefined): ModelRef | null {
  if (!ref) return null
  const slash = ref.indexOf('/')
  if (slash <= 0 || slash === ref.length - 1) return null
  return {
    provider: ref.slice(0, slash),
    model: ref.slice(slash + 1),
  }
}

function joinModelRef(provider: string | undefined, model: string | undefined): string | undefined {
  if (!model) return undefined
  if (model.includes('/')) return model
  return provider ? `${provider}/${model}` : undefined
}

function readModelPrimary(block: unknown): string | undefined {
  if (typeof block === 'string') return readString(block)
  if (!isRecord(block)) return undefined
  return readString(block.primary)
}

function findAgentConfig(config: Record<string, unknown>, agentId: string): Record<string, unknown> | null {
  const agents = isRecord(config.agents) ? config.agents : null
  const list = agents && Array.isArray(agents.list) ? agents.list : []
  for (const item of list) {
    if (!isRecord(item)) continue
    if (readString(item.id) === agentId) return item
  }
  return null
}

function readConfiguredModelRef(params: {
  config: Record<string, unknown>
  agentId: string
  agentModel?: string
}): { ref: string; source: ChatModelSource } | null {
  const { config, agentId, agentModel } = params
  const agentEntry = findAgentConfig(config, agentId)
  const agentRef =
    readModelPrimary(agentEntry?.model) ??
    readModelPrimary(agentEntry?.models) ??
    readString(agentModel)
  if (agentRef) return { ref: agentRef, source: 'agent' }

  const agents = isRecord(config.agents) ? config.agents : null
  const defaults = agents && isRecord(agents.defaults) ? agents.defaults : null
  const defaultRef = readModelPrimary(defaults?.model) ?? readModelPrimary(defaults?.models)
  if (defaultRef) return { ref: defaultRef, source: 'default' }

  return null
}

function readSessionModelRef(session: unknown): string | undefined {
  if (!isRecord(session)) return undefined
  const provider = readString(session.modelProvider)
  const model = readString(session.model)
  if (provider === 'openclaw' && model === 'gateway-injected') return undefined
  return joinModelRef(provider, model)
}

function findProviderModelName(config: Record<string, unknown>, ref: ModelRef): string | undefined {
  const models = isRecord(config.models) ? config.models : null
  const providers =
    models && isRecord(models.providers)
      ? models.providers
      : isRecord(config.providers)
        ? config.providers
        : null
  let provider: Record<string, unknown> | null = null
  const providerCandidate = providers?.[ref.provider]
  if (isRecord(providerCandidate)) provider = providerCandidate
  const rawProviderModels = provider?.['models']
  const providerModels = Array.isArray(rawProviderModels) ? rawProviderModels : []
  for (const entry of providerModels) {
    if (!isRecord(entry)) continue
    if (readString(entry.id) !== ref.model) continue
    return readString(entry.name) ?? readString(entry.displayName)
  }
  return undefined
}

function findAgentCatalogName(config: Record<string, unknown>, fullRef: string): string | undefined {
  const agents = isRecord(config.agents) ? config.agents : null
  const defaults = agents && isRecord(agents.defaults) ? agents.defaults : null
  const catalog = defaults && isRecord(defaults.models) ? defaults.models : null
  const entry = catalog && isRecord(catalog[fullRef]) ? catalog[fullRef] : null
  return readString(entry?.name) ?? readString(entry?.displayName) ?? readString(entry?.alias)
}

export function formatChatModelLabel(
  ref: string,
  config: Record<string, unknown> = {},
): string {
  const parsed = splitModelRef(ref)
  if (!parsed) return ref
  return (
    findProviderModelName(config, parsed) ??
    findAgentCatalogName(config, ref) ??
    parsed.model
  )
}

export function resolveOpenClawChatModelSummary(params: {
  config: Record<string, unknown>
  agentId: string
  agentModel?: string
  session?: unknown
}): ChatModelSummary | null {
  const sessionRef = readSessionModelRef(params.session)
  if (sessionRef) {
    return {
      ref: sessionRef,
      label: formatChatModelLabel(sessionRef, params.config),
      source: 'session',
    }
  }

  const configured = readConfiguredModelRef(params)
  if (!configured) return null
  return {
    ref: configured.ref,
    label: formatChatModelLabel(configured.ref, params.config),
    source: configured.source,
  }
}

export function resolvePiChatModelSummary(params: {
  config: Record<string, unknown>
  settings?: unknown
}): ChatModelSummary | null {
  const settings = isRecord(params.settings) ? params.settings : null
  const ref = joinModelRef(readString(settings?.defaultProvider), readString(settings?.defaultModel))
  if (!ref) return null
  return {
    ref,
    label: formatChatModelLabel(ref, params.config),
    source: 'pi-settings',
  }
}

export function resolveChatModelSummary(params: {
  runtime: ChatRuntime
  config: Record<string, unknown>
  agentId: string
  agentModel?: string
  session?: unknown
  settings?: unknown
}): ChatModelSummary | null {
  if (params.runtime === 'pi') {
    return resolvePiChatModelSummary({ config: params.config, settings: params.settings })
  }
  return resolveOpenClawChatModelSummary(params)
}
