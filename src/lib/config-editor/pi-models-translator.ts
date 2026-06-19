import type { ProviderEntry } from './provider-sync'

type PiModelEntry = ProviderEntry['models'][number]

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
    models: entry.models.map((model) => ({ ...model })),
  }
}

export function buildPiModelsPatch(
  providerId: string,
  entry: ProviderEntry,
  options: { defaultModelId?: string } = {},
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
    }
  }
  return patch
}

export function buildPiModelsPatchFromEntries(
  entries: Record<string, ProviderEntry>,
  options: { defaultProviderId?: string; defaultModelId?: string } = {},
): PiModelsPatch {
  const providers = Object.fromEntries(
    Object.entries(entries).map(([providerId, entry]) => [
      providerId,
      toPiProviderEntry(entry),
    ]),
  )
  const patch: PiModelsPatch = { models: { providers } }
  if (options.defaultProviderId && options.defaultModelId) {
    patch.settings = {
      defaultProvider: options.defaultProviderId,
      defaultModel: options.defaultModelId,
    }
  }
  return patch
}
