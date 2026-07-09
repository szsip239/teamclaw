import type { ProviderEntry } from './provider-sync'
import { TEAMCLAW_DEFAULT_THINKING_LEVEL, type TeamClawThinkingLevel } from './thinking-levels'

type PiModelEntry = ProviderEntry['models'][number]

const PI_COMPAT_KEYS = new Set([
  'supportsDeveloperRole',
  'supportsEagerToolInputStreaming',
  'supportsLongCacheRetention',
  'supportsReasoningEffort',
  'supportsStore',
  'supportsStrictMode',
  'supportsUsageInStreaming',
  'maxTokensField',
  'requiresAssistantAfterToolResult',
  'requiresReasoningContentOnAssistantMessages',
  'requiresThinkingAsText',
  'requiresToolResultName',
  'thinkingFormat',
  'cacheControlFormat',
  'openRouterRouting',
  'vercelGatewayRouting',
  'sendSessionIdHeader',
])

export interface PiProviderEntry {
  baseUrl: string
  apiKey: string
  api: string
  models: PiModelEntry[]
}

export interface PiModelsPatch {
  models: {
    providers: Record<string, PiProviderEntry>
  }
  settings?: {
    defaultProvider: string
    defaultModel: string
    defaultThinkingLevel?: TeamClawThinkingLevel
  }
}

export function mapProviderApiToPiApi(api: string | undefined): string {
  if (api === undefined) return 'openai-completions'

  switch (api) {
    case 'anthropic':
    case 'anthropic-messages':
      return 'anthropic-messages'
    case 'google':
    case 'google-generative-ai':
      return 'google-generative-ai'
    case 'openai':
    case 'openai-completions':
      return 'openai-completions'
    default:
      throw new Error(`Unsupported Pi provider API type: ${api}`)
  }
}

export function toPiProviderEntry(entry: ProviderEntry): PiProviderEntry {
  return {
    baseUrl: entry.baseUrl,
    apiKey: entry.apiKey,
    api: mapProviderApiToPiApi(entry.api),
    models: entry.models.map((model) => {
      const { api: _api, compat, cost, ...rest } = model
      const piCompat = sanitizePiCompat(compat)
      return {
        ...rest,
        ...(cost ? { cost: normalizePiCost(cost) } : {}),
        ...(piCompat ? { compat: piCompat } : {}),
      }
    }),
  }
}

function normalizePiCost(cost: NonNullable<PiModelEntry['cost']>): NonNullable<PiModelEntry['cost']> {
  return {
    input: cost.input,
    output: cost.output,
    cacheRead: cost.cacheRead ?? 0,
    cacheWrite: cost.cacheWrite ?? 0,
  }
}

function sanitizePiCompat(compat: PiModelEntry['compat']): PiModelEntry['compat'] | undefined {
  if (!compat) return undefined
  const result = Object.fromEntries(
    Object.entries(compat).filter(([key]) => PI_COMPAT_KEYS.has(key)),
  ) as NonNullable<PiModelEntry['compat']>
  return Object.keys(result).length > 0 ? result : undefined
}

export function buildPiModelsPatch(
  providerId: string,
  entry: ProviderEntry,
  options: { defaultModelId?: string; defaultThinkingLevel?: TeamClawThinkingLevel } = {},
): PiModelsPatch {
  const patch: PiModelsPatch = {
    models: {
      providers: {
        [providerId]: toPiProviderEntry(entry),
      },
    },
  }
  if (options.defaultModelId) {
    patch.settings = {
      defaultProvider: providerId,
      defaultModel: options.defaultModelId,
      defaultThinkingLevel: options.defaultThinkingLevel ?? TEAMCLAW_DEFAULT_THINKING_LEVEL,
    }
  }
  return patch
}

export function buildPiModelsPatchFromEntries(
  entries: Record<string, ProviderEntry>,
  options: {
    defaultProviderId?: string
    defaultModelId?: string
    defaultThinkingLevel?: TeamClawThinkingLevel
  } = {},
): PiModelsPatch {
  const providers = Object.fromEntries(
    Object.entries(entries).map(([providerId, entry]) => [providerId, toPiProviderEntry(entry)]),
  )
  const patch: PiModelsPatch = { models: { providers } }
  if (options.defaultProviderId && options.defaultModelId) {
    patch.settings = {
      defaultProvider: options.defaultProviderId,
      defaultModel: options.defaultModelId,
      defaultThinkingLevel: options.defaultThinkingLevel ?? TEAMCLAW_DEFAULT_THINKING_LEVEL,
    }
  }
  return patch
}
