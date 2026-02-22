import { getProvider, type ProviderDef } from './providers'
import { decryptCredential } from './credential-utils'
import { isKnownMultimodal } from './model-capabilities'
import type { TestConnectionResult, ResourceConfig, DetectedModelInfo } from '@/types/resource'

const TEST_TIMEOUT_MS = 10_000

/**
 * Test connectivity for a resource by calling its provider's test endpoint.
 * Returns result with latency, success/failure, and optional model list with multimodal detection.
 */
export async function testConnection(
  provider: string,
  encryptedCredentials: string,
  config?: ResourceConfig | null,
): Promise<TestConnectionResult> {
  const providerDef = getProvider(provider)
  if (!providerDef) {
    return { ok: false, latencyMs: 0, error: `未知的 Provider: ${provider}` }
  }

  let apiKey: string
  try {
    apiKey = decryptCredential(encryptedCredentials)
  } catch {
    return { ok: false, latencyMs: 0, error: '凭据解密失败' }
  }

  return executeTest(providerDef, apiKey, config)
}

async function executeTest(
  providerDef: ProviderDef,
  apiKey: string,
  config?: ResourceConfig | null,
): Promise<TestConnectionResult> {
  const { testEndpoint } = providerDef
  const baseUrl = config?.baseUrl || providerDef.baseUrl || ''

  // Resolve URL
  let url: string
  if (typeof testEndpoint.url === 'function') {
    if (!baseUrl) {
      return { ok: false, latencyMs: 0, error: '需要提供 API 地址 (baseUrl)' }
    }
    url = testEndpoint.url(baseUrl)
  } else if (config?.baseUrl && providerDef.baseUrl && config.baseUrl !== providerDef.baseUrl) {
    url = testEndpoint.url.replace(providerDef.baseUrl, config.baseUrl)
  } else {
    url = testEndpoint.url
  }

  // Google uses query param auth
  if (providerDef.id === 'google') {
    const sep = url.includes('?') ? '&' : '?'
    url = `${url}${sep}key=${encodeURIComponent(apiKey)}`
  }

  const headers = testEndpoint.headers(apiKey)
  const body = testEndpoint.body ? JSON.stringify(testEndpoint.body(apiKey)) : undefined

  if (body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json'
  }

  const start = Date.now()

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: testEndpoint.method,
      headers,
      body,
      signal: controller.signal,
    })

    const latencyMs = Date.now() - start

    if (!response.ok) {
      let errorMsg: string
      try {
        const errData = await response.json() as Record<string, unknown>
        errorMsg = extractErrorMessage(errData) || `HTTP ${response.status}`
      } catch {
        errorMsg = `HTTP ${response.status} ${response.statusText}`
      }

      // Billing/quota errors mean auth succeeded — treat as OK with warning
      if (isBillingError(response.status, errorMsg)) {
        return { ok: true, latencyMs, error: `认证成功，但: ${errorMsg}` }
      }

      return { ok: false, latencyMs, error: errorMsg }
    }

    // Try to extract model list from response
    const details: TestConnectionResult['details'] = {}
    try {
      const data = await response.json() as Record<string, unknown>
      const { models, detectedModels } = extractModelsWithCapabilities(data)
      if (models.length > 0) {
        details.models = models.slice(0, 20)
        details.detectedModels = detectedModels.slice(0, 20)
      }
    } catch {
      // Response might not be JSON — that's fine
    }

    return { ok: true, latencyMs, details }
  } catch (err) {
    const latencyMs = Date.now() - start
    const error = err instanceof Error
      ? (err.name === 'AbortError' ? '连接超时 (10s)' : err.message)
      : '连接失败'
    return { ok: false, latencyMs, error }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Billing/quota errors indicate the API key is valid but the account
 * has no credits. This is a successful connection test.
 */
function isBillingError(status: number, message: string): boolean {
  if (status === 402) return true
  const lower = message.toLowerCase()
  return /insufficient.*(balance|credit|fund|quota)/i.test(lower)
    || /quota.*exceeded/i.test(lower)
    || /payment.*required/i.test(lower)
}

function extractErrorMessage(data: Record<string, unknown>): string | undefined {
  if (typeof data.error === 'object' && data.error !== null) {
    const errObj = data.error as Record<string, unknown>
    if (typeof errObj.message === 'string') return errObj.message
  }
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message
  return undefined
}

interface ModelExtractionResult {
  models: string[]
  detectedModels: DetectedModelInfo[]
}

function extractModelsWithCapabilities(data: Record<string, unknown>): ModelExtractionResult {
  const models: string[] = []
  const detectedModels: DetectedModelInfo[] = []

  // OpenAI-compatible: { data: [{ id: "model-name", ... }] }
  if (Array.isArray(data.data)) {
    for (const item of data.data) {
      if (typeof item !== 'object' || item === null) continue
      const m = item as Record<string, unknown>
      if (typeof m.id !== 'string') continue

      models.push(m.id)

      // Try to detect multimodal from API response metadata
      let multimodal = detectMultimodalFromApiResponse(m)

      // Fallback to known model patterns
      if (multimodal === undefined) {
        multimodal = isKnownMultimodal(m.id) ?? undefined
      }

      detectedModels.push({ id: m.id, multimodal })
    }
    return { models, detectedModels }
  }

  // Google: { models: [{ name: "models/gemini-pro", ... }] }
  if (Array.isArray(data.models)) {
    for (const item of data.models) {
      if (typeof item !== 'object' || item === null) continue
      const m = item as Record<string, unknown>
      if (typeof m.name !== 'string') continue

      const id = m.name.replace(/^models\//, '')
      models.push(id)

      // Google provides supportedGenerationMethods
      let multimodal = detectMultimodalFromGoogleResponse(m)
      if (multimodal === undefined) {
        multimodal = isKnownMultimodal(id) ?? undefined
      }

      detectedModels.push({ id, multimodal })
    }
    return { models, detectedModels }
  }

  return { models, detectedModels }
}

/**
 * Detect multimodal capability from OpenAI-compatible API response fields.
 * OpenRouter provides `architecture.modality`, some APIs provide `capabilities`.
 */
function detectMultimodalFromApiResponse(model: Record<string, unknown>): boolean | undefined {
  // OpenRouter: architecture.modality includes "image" or similar
  if (typeof model.architecture === 'object' && model.architecture !== null) {
    const arch = model.architecture as Record<string, unknown>
    if (typeof arch.modality === 'string') {
      return arch.modality.includes('image') || arch.modality.includes('multimodal')
    }
    if (typeof arch.input_modalities === 'string') {
      return arch.input_modalities.includes('image')
    }
  }

  // Some APIs: capabilities.vision or similar
  if (typeof model.capabilities === 'object' && model.capabilities !== null) {
    const caps = model.capabilities as Record<string, unknown>
    if (typeof caps.vision === 'boolean') return caps.vision
  }

  // input_modalities array (some providers)
  if (Array.isArray(model.input_modalities)) {
    return model.input_modalities.some((m: unknown) =>
      typeof m === 'string' && (m === 'image' || m === 'vision'),
    )
  }

  return undefined
}

/**
 * Detect multimodal from Google's model metadata.
 */
function detectMultimodalFromGoogleResponse(model: Record<string, unknown>): boolean | undefined {
  // Google provides inputTokenLimit and supportedGenerationMethods
  // Models with "vision" in supported features
  if (Array.isArray(model.supportedGenerationMethods)) {
    // All Gemini models support images by default
    return true
  }
  return undefined
}
