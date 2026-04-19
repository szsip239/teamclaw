export type ResourceType = 'MODEL' | 'TOOL'
export type ResourceStatus = 'ACTIVE' | 'UNTESTED' | 'ERROR'

/** Resource overview for list page */
export interface ResourceOverview {
  id: string
  name: string
  type: ResourceType
  provider: string
  providerName: string
  status: ResourceStatus
  maskedKey: string
  config: ResourceConfig | null
  description: string | null
  isDefault: boolean
  /** When true, this Resource's config.defaultModelId becomes primary for new instances */
  isDefaultModel: boolean
  lastTestedAt: string | null
  lastTestError: string | null
  createdByName: string
  createdAt: string
  updatedAt: string
}

/** Resource detail (same as overview — no extra joins needed) */
export type ResourceDetail = ResourceOverview

/** OpenClaw model definition (maps to models.providers.X.models[]) */
export interface ModelDefinition {
  id: string
  name: string
  reasoning?: boolean
  input?: string[]           // ["text"] or ["text", "image"]
  cost?: {
    input: number            // per million tokens
    output: number
    cacheRead?: number
    cacheWrite?: number
  }
  contextWindow?: number
  maxTokens?: number
}

/** Non-sensitive resource config (maps to OpenClaw models.providers.X) */
export interface ResourceConfig {
  baseUrl?: string
  apiType?: string           // "anthropic-messages" | "openai-completions" | "openai-responses" | "google-generative-ai"
  envVarName?: string
  authHeader?: boolean       // custom auth header handling
  headers?: Record<string, string>  // custom HTTP headers
  models?: ModelDefinition[] // available models from this provider
  /** Model id (from models[]) used as `agents.defaults.model.primary` when isDefaultModel=true */
  defaultModelId?: string
}

/** Detected model info from connection test */
export interface DetectedModelInfo {
  id: string
  multimodal?: boolean
}

/** Connection test result */
export interface TestConnectionResult {
  ok: boolean
  latencyMs: number
  error?: string
  details?: {
    models?: string[]
    detectedModels?: DetectedModelInfo[]
  }
}

/** Resources list API response */
export interface ResourceListResponse {
  resources: ResourceOverview[]
  total: number
  page: number
  pageSize: number
}

/**
 * Provider variant — a connection preset for the same underlying provider.
 *
 * Used to express region (国内/国际) and plan (普通/Coding) differences without
 * bloating the provider picker. At Resource create-time, the user picks the
 * parent provider then picks a variant; the variant's fields are used to
 * prefill the Resource config.
 *
 * When a provider has variants, the first entry is the default used as the
 * top-level baseUrl/envVarName/modelsDevId of the parent ProviderInfo.
 */
export interface ProviderVariant {
  /** Stable id within the provider, e.g. "cn-regular" */
  id: string
  /** Human-readable label shown in the dropdown, e.g. "国内 · 普通" */
  label: string
  baseUrl: string
  envVarName?: string
  apiType?: string
  modelsDevId?: string
  /** Optional short description shown under the variant option */
  description?: string
}

/** Provider definition for the built-in registry */
export interface ProviderInfo {
  id: string
  name: string
  type: ResourceType
  authMethod: 'API_KEY' | 'TOKEN'
  envVarName?: string
  apiType?: string
  baseUrl?: string
  icon: string
  description: string
  configFields?: { key: string; label: string; placeholder?: string; required: boolean }[]
  defaultModels?: ModelDefinition[]
  baseUrlHint?: string
  /**
   * models.dev provider id — used to pull model catalog from the upstream
   * models.dev registry. Omit when the provider has no models.dev entry.
   * When `variants` is present, this is the default (first variant's) id.
   */
  modelsDevId?: string
  /**
   * Connection-preset variants. Present when the provider has multiple
   * endpoints (region / plan combinations). UI shows a second-level dropdown
   * and prefills baseUrl/envVarName/apiType/modelsDevId from the chosen entry.
   */
  variants?: ProviderVariant[]
}

/** Providers list API response */
export interface ProviderListResponse {
  providers: ProviderInfo[]
}
