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
}

/** Providers list API response */
export interface ProviderListResponse {
  providers: ProviderInfo[]
}
