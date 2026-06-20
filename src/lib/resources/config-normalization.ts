import type { ResourceConfig } from '@/types/resource'

export const VOLCENGINE_CODING_BASE_URL = 'https://ark.cn-beijing.volces.com/api/coding/v3'
export const VOLCENGINE_AGENT_PLAN_ANTHROPIC_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan'
export const VOLCENGINE_AGENT_PLAN_BASE_URL = 'https://ark.cn-beijing.volces.com/api/plan/v3'
export const VOLCENGINE_STANDARD_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3'

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

export function normalizeProviderBaseUrl(
  providerId: string,
  baseUrl: string,
  apiType?: string,
): string {
  if (providerId !== 'doubao') return baseUrl

  const normalized = normalizeBaseUrl(baseUrl)
  if (normalized === 'https://ark.cn-beijing.volces.com/api/coding') {
    return VOLCENGINE_CODING_BASE_URL
  }
  if (normalized === 'https://ark.cn-beijing.volces.com/api/plan') {
    return apiType === 'openai-completions'
      ? VOLCENGINE_AGENT_PLAN_BASE_URL
      : VOLCENGINE_AGENT_PLAN_ANTHROPIC_BASE_URL
  }

  return baseUrl
}

export function resolveDoubaoVariant(
  baseUrl: string,
  apiType?: string,
): {
  baseUrl: string
  apiType: 'anthropic-messages' | 'openai-completions'
  envVarName: string
  openClawProviderId: string
} | null {
  const normalized = normalizeBaseUrl(normalizeProviderBaseUrl('doubao', baseUrl, apiType))
  if (normalized.includes('/api/plan')) {
    const isAnthropic =
      apiType === 'anthropic-messages' || normalized === VOLCENGINE_AGENT_PLAN_ANTHROPIC_BASE_URL
    return {
      baseUrl: isAnthropic
        ? VOLCENGINE_AGENT_PLAN_ANTHROPIC_BASE_URL
        : VOLCENGINE_AGENT_PLAN_BASE_URL,
      apiType: isAnthropic ? 'anthropic-messages' : 'openai-completions',
      envVarName: 'ARK_AGENT_PLAN_API_KEY',
      openClawProviderId: 'volcengine-agent-plan',
    }
  }
  if (normalized === VOLCENGINE_CODING_BASE_URL || normalized.includes('/api/coding')) {
    return {
      baseUrl: VOLCENGINE_CODING_BASE_URL,
      apiType: 'openai-completions',
      envVarName: 'VOLCANO_ENGINE_API_KEY',
      openClawProviderId: 'volcengine-plan',
    }
  }
  if (normalized === VOLCENGINE_STANDARD_BASE_URL) {
    return {
      baseUrl: VOLCENGINE_STANDARD_BASE_URL,
      apiType: 'openai-completions',
      envVarName: 'VOLCANO_ENGINE_API_KEY',
      openClawProviderId: 'volcengine',
    }
  }
  return null
}

export function normalizeResourceConfigForProvider(
  providerId: string,
  config?: ResourceConfig | null,
): ResourceConfig | null {
  if (!config) return config ?? null
  const baseUrl = config.baseUrl
  if (providerId !== 'doubao' || !baseUrl) return config

  const variant = resolveDoubaoVariant(baseUrl, config.apiType)
  if (!variant) {
    return {
      ...config,
      baseUrl: normalizeProviderBaseUrl(providerId, baseUrl, config.apiType),
    }
  }

  return {
    ...config,
    baseUrl: variant.baseUrl,
    apiType: variant.apiType,
    envVarName: variant.envVarName,
    openClawProviderId: variant.openClawProviderId,
  }
}
