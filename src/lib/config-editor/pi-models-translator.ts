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
}

export function mapProviderApiToPiApi(api: string | undefined): string {
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
      return 'openai-completions'
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

export function buildPiModelsPatch(providerId: string, entry: ProviderEntry): PiModelsPatch {
  return {
    models: {
      providers: {
        [providerId]: toPiProviderEntry(entry),
      },
    },
  }
}
