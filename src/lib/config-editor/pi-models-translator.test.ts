import { describe, expect, it } from 'vitest'
import type { ProviderEntry } from './provider-sync'
import {
  buildPiModelsPatch,
  mapProviderApiToPiApi,
  toPiProviderEntry,
} from './pi-models-translator'

const providerEntry: ProviderEntry = {
  baseUrl: 'https://api.anthropic.com',
  apiKey: 'secret-key',
  api: 'anthropic',
  models: [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      reasoning: true,
      input: ['text', 'image'],
      contextWindow: 200000,
      maxTokens: 8192,
      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    },
  ],
}

describe('pi models translator', () => {
  it('maps OpenClaw and legacy API identifiers to pi API identifiers', () => {
    expect(mapProviderApiToPiApi('anthropic')).toBe('anthropic-messages')
    expect(mapProviderApiToPiApi('anthropic-messages')).toBe('anthropic-messages')
    expect(mapProviderApiToPiApi('openai')).toBe('openai-completions')
    expect(mapProviderApiToPiApi('openai-completions')).toBe('openai-completions')
    expect(mapProviderApiToPiApi('google')).toBe('google-generative-ai')
    expect(mapProviderApiToPiApi('google-generative-ai')).toBe('google-generative-ai')
    expect(mapProviderApiToPiApi(undefined)).toBe('openai-completions')
  })

  it('rejects unsupported API identifiers instead of silently using OpenAI', () => {
    expect(() => mapProviderApiToPiApi('unknown-provider-api')).toThrow(
      'Unsupported Pi provider API type',
    )
  })

  it('keeps provider credentials and model capability metadata in pi format', () => {
    expect(toPiProviderEntry(providerEntry)).toEqual({
      baseUrl: 'https://api.anthropic.com',
      apiKey: 'secret-key',
      api: 'anthropic-messages',
      models: [
        {
          id: 'claude-sonnet-4-20250514',
          name: 'Claude Sonnet 4',
          reasoning: true,
          input: ['text', 'image'],
          contextWindow: 200000,
          maxTokens: 8192,
          cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
        },
      ],
    })
  })

  it('builds a config.patch payload accepted by pi-wrapper', () => {
    expect(buildPiModelsPatch('anthropic', providerEntry)).toEqual({
      models: {
        providers: {
          anthropic: {
            baseUrl: 'https://api.anthropic.com',
            apiKey: 'secret-key',
            api: 'anthropic-messages',
            models: [
              {
                id: 'claude-sonnet-4-20250514',
                name: 'Claude Sonnet 4',
                reasoning: true,
                input: ['text', 'image'],
                contextWindow: 200000,
                maxTokens: 8192,
                cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
              },
            ],
          },
        },
      },
    })
  })

  it('can include Pi default model settings for manual Pi pushes', () => {
    expect(buildPiModelsPatch('anthropic', providerEntry, {
      defaultModelId: 'claude-sonnet-4-20250514',
    })).toMatchObject({
      settings: {
        defaultProvider: 'anthropic',
        defaultModel: 'claude-sonnet-4-20250514',
      },
    })
  })
})
