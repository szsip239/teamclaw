import type { UiHint } from './gateway'

/** Subset of JSON Schema used by OpenClaw config.schema */
export interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  additionalProperties?: JsonSchema | boolean
  items?: JsonSchema
  anyOf?: JsonSchema[]
  oneOf?: JsonSchema[]
  const?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  required?: string[]
  description?: string
  title?: string
}

// ─── Module Navigation ──────────────────────────────────────────────

export interface ConfigModule {
  /** Top-level key in config (e.g. "gateway", "agents", "models") */
  key: string
  /** Display label from uiHints or humanized key */
  label: string
  /** Whether this module has values in current config */
  isActive: boolean
  /** Sort order from uiHints */
  order: number
  /** Schema fragment for this module */
  schema: JsonSchema
}

// ─── Edit Source Tracking (anti-loop) ───────────────────────────────

export type EditSource = 'form' | 'monaco' | 'ai' | null

// ─── API Response Types ─────────────────────────────────────────────

/** Combined response from GET /api/v1/instances/[id]/schema */
export interface ConfigEditorInitResponse {
  schema: Record<string, unknown>
  uiHints: Record<string, UiHint>
  version?: string
  config: Record<string, unknown>
  hash: string
}

export interface ConfigPatchInput {
  patch: Record<string, unknown>
  baseHash: string
  missingProviders?: string[]
}
