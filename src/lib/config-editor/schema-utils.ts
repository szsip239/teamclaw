import type { JsonSchema, ConfigModule } from '@/types/config-editor'
import type { UiHint } from '@/types/gateway'

// ─── Module Extraction ──────────────────────────────────────────────

/**
 * Extract top-level modules from the config schema.
 * Each top-level key with `type: "object"` becomes a navigable module.
 */
export function extractModules(
  schema: JsonSchema,
  uiHints: Record<string, UiHint>,
  config: Record<string, unknown>,
): ConfigModule[] {
  const properties = schema.properties
  if (!properties) return []

  return Object.entries(properties).map(([key, subSchema]) => {
    const hint = uiHints[key]
    return {
      key,
      label: hint?.label ?? humanizeKey(key),
      isActive: config[key] !== undefined && config[key] !== null,
      order: hint?.order ?? 999,
      schema: subSchema,
    }
  }).sort((a, b) => a.order - b.order)
}

// ─── Value Access (dot-notation) ────────────────────────────────────

/**
 * Get a value from a nested object using dot-notation path.
 * Supports array index notation: "agents.list.0.id"
 */
export function getFieldValue(
  config: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split('.')
  let current: unknown = config

  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part]
    } else {
      return undefined
    }
  }

  return current
}

/**
 * Set a value in a nested object using dot-notation path.
 * Returns a new object (immutable update).
 */
export function setFieldValue(
  config: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.')
  const result = structuredClone(config)
  let current: Record<string, unknown> = result

  // Track parent chain for empty-object cleanup on delete
  const ancestors: { obj: Record<string, unknown>; key: string }[] = []

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (current[part] === undefined || current[part] === null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    ancestors.push({ obj: current, key: part })
    current = current[part] as Record<string, unknown>
  }

  const lastKey = parts[parts.length - 1]
  if (value === undefined) {
    delete current[lastKey]
    // Walk back up and prune empty parent objects
    for (let i = ancestors.length - 1; i >= 0; i--) {
      const { obj, key } = ancestors[i]
      const child = obj[key] as Record<string, unknown>
      if (Object.keys(child).length === 0) {
        delete obj[key]
      } else {
        break // parent still has other keys, stop pruning
      }
    }
  } else {
    current[lastKey] = value
  }

  return result
}

// ─── Patch Building ─────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Build a recursive deep patch from old and new config.
 * - Both plain objects → recurse, only emit changed leaves
 * - Array/primitive/type mismatch → replace entirely
 * - Old has key, new doesn't → `null` (OpenClaw delete convention)
 * - Value is `'__OPENCLAW_REDACTED__'` → skip (don't leak redacted tokens)
 */
function buildDeepPatch(
  oldVal: unknown,
  newVal: unknown,
): unknown {
  if (!isPlainObject(oldVal) || !isPlainObject(newVal)) {
    return newVal
  }

  const patch: Record<string, unknown> = {}

  for (const key of Object.keys(newVal)) {
    const nv = newVal[key]
    // Skip redacted values — they haven't truly changed
    if (nv === '__OPENCLAW_REDACTED__') continue

    if (!(key in oldVal)) {
      // New key added
      patch[key] = nv
    } else {
      const ov = oldVal[key]
      if (isPlainObject(ov) && isPlainObject(nv)) {
        const sub = buildDeepPatch(ov, nv) as Record<string, unknown>
        if (Object.keys(sub).length > 0) {
          patch[key] = sub
        }
      } else if (JSON.stringify(ov) !== JSON.stringify(nv)) {
        patch[key] = nv
      }
    }
  }

  // Deleted keys
  for (const key of Object.keys(oldVal)) {
    if (!(key in newVal)) {
      patch[key] = null
    }
  }

  return patch
}

/**
 * Build a minimal patch object from old and new config.
 * Recursively diffs nested objects to produce the smallest possible patch.
 * Uses `null` to mark deleted keys (OpenClaw convention).
 * Skips `__OPENCLAW_REDACTED__` values to avoid leaking them into patches.
 */
export function buildPatch(
  oldConfig: Record<string, unknown>,
  newConfig: Record<string, unknown>,
): Record<string, unknown> {
  return buildDeepPatch(oldConfig, newConfig) as Record<string, unknown>
}

// ─── Schema Type Detection ──────────────────────────────────────────

/**
 * Check if a schema represents an enum via anyOf [{const: ...}] pattern.
 * OpenClaw uses `anyOf: [{const:"a"}, {const:"b"}]` instead of `enum`.
 */
export function isAnyOfEnum(schema: JsonSchema): boolean {
  if (!schema.anyOf || schema.anyOf.length === 0) return false
  return schema.anyOf.every(item => 'const' in item)
}

/**
 * Extract enum values from an anyOf const pattern.
 */
export function extractAnyOfValues(schema: JsonSchema): unknown[] {
  if (!schema.anyOf) return []
  return schema.anyOf
    .filter(item => 'const' in item)
    .map(item => item.const)
}

/**
 * Extract descriptions from anyOf const items.
 * OpenClaw schema may include title/description on each anyOf entry:
 *   anyOf: [{const:"local", title:"Run locally"}, {const:"remote", description:"..."}]
 * Returns a map of value → description, only for items that have one.
 */
export function extractAnyOfDescriptions(schema: JsonSchema): Record<string, string> {
  if (!schema.anyOf) return {}
  const result: Record<string, string> = {}
  for (const item of schema.anyOf) {
    if ('const' in item) {
      const desc = item.title ?? item.description
      if (desc) {
        result[String(item.const)] = desc
      }
    }
  }
  return result
}

/**
 * Check if a schema is a union type (anyOf with mixed types).
 * e.g. anyOf: [{type:"string"}, {type:"object", properties:{...}}]
 */
export function isUnionType(schema: JsonSchema): boolean {
  if (!schema.anyOf || schema.anyOf.length === 0) return false
  // Not a simple enum — at least one item has type/properties instead of just const
  if (isAnyOfEnum(schema)) return false
  return schema.anyOf.some(item => item.type || item.properties)
}

/**
 * Detect the effective field type for rendering.
 */
export function detectFieldType(
  schema: JsonSchema,
): 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'union' | 'unknown' {
  if (isAnyOfEnum(schema)) return 'enum'
  if (isUnionType(schema)) return 'union'

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type

  switch (type) {
    case 'string': return 'string'
    case 'integer':
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'object': return 'object'
    case 'array': return 'array'
    default:
      // Some fields may lack type but have properties → object
      if (schema.properties) return 'object'
      if (schema.anyOf) return 'union'
      return 'unknown'
  }
}

// ─── Layout Helpers ─────────────────────────────────────────────────

/**
 * Check if a schema represents a "simple" field suitable for two-column layout.
 * Simple: boolean, number, or plain string.
 * Complex (full-width): enum (flat radio cards), object, array, union, additionalProperties.
 */
export function isSimpleField(schema: JsonSchema): boolean {
  if (schema.properties || schema.additionalProperties) return false
  const type = detectFieldType(schema)
  return type === 'boolean' || type === 'number' || type === 'string'
}

// ─── Display Helpers ────────────────────────────────────────────────

/** Convert a camelCase/snake_case key to a human-readable label */
export function humanizeKey(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ─── JSON Line Mapping ──────────────────────────────────────────────

/**
 * Find the line number of a dot-path key in a pretty-printed JSON string.
 * Relies on `JSON.stringify(_, _, 2)` format where depth N → indent N*2 spaces.
 *
 * For path "gateway.auth.mode":
 *   1. Find `  "gateway"` (indent=2)
 *   2. After that, find `    "auth"` (indent=4)
 *   3. After that, find `      "mode"` (indent=6)
 *
 * Returns 1-indexed line number, or null if not found.
 */
export function findLineForPath(jsonString: string, dotPath: string): number | null {
  const segments = dotPath.split('.')
  const lines = jsonString.split('\n')
  let segmentIndex = 0
  let searchFrom = 0

  while (segmentIndex < segments.length) {
    const indent = ' '.repeat((segmentIndex + 1) * 2)
    const target = `${indent}"${segments[segmentIndex]}"`

    let found = false
    for (let i = searchFrom; i < lines.length; i++) {
      if (lines[i].startsWith(target)) {
        segmentIndex++
        searchFrom = i + 1
        if (segmentIndex === segments.length) {
          return i + 1 // 1-indexed
        }
        found = true
        break
      }
    }

    if (!found) return null
  }

  return null
}

// ─── Provider Reference Extraction ──────────────────────────────────

/**
 * Scan config for all model references (provider/model format) and
 * collect which providers are already configured in models.providers.
 *
 * Scans:
 *  - agents.defaults.model.primary / .fallbacks
 *  - agents.defaults.imageModel.primary / .fallbacks
 *  - agents.list[*].model.primary / .fallbacks
 *  - agents.list[*].imageModel.primary / .fallbacks
 */
export function extractReferencedProviders(
  config: Record<string, unknown>,
): { referenced: Set<string>; existing: Set<string> } {
  const referenced = new Set<string>()
  const existing = new Set<string>()

  // Helper: extract provider from "provider/model" string
  const addRef = (val: unknown) => {
    if (typeof val === 'string' && val.includes('/')) {
      referenced.add(val.split('/')[0])
    }
  }

  // Helper: scan a model block { primary, fallbacks }
  const scanModelBlock = (block: unknown) => {
    if (!block || typeof block !== 'object') return
    const b = block as Record<string, unknown>
    addRef(b.primary)
    if (Array.isArray(b.fallbacks)) {
      for (const f of b.fallbacks) addRef(f)
    }
  }

  // Scan agents.defaults
  const agents = config.agents as Record<string, unknown> | undefined
  if (agents) {
    const defaults = agents.defaults as Record<string, unknown> | undefined
    if (defaults) {
      scanModelBlock(defaults.model)
      scanModelBlock(defaults.imageModel)
    }

    // Scan agents.list[*]
    const list = agents.list
    if (Array.isArray(list)) {
      for (const agent of list) {
        if (agent && typeof agent === 'object') {
          const a = agent as Record<string, unknown>
          scanModelBlock(a.model)
          scanModelBlock(a.imageModel)
        }
      }
    }
  }

  // Collect existing provider keys from models.providers
  const models = config.models as Record<string, unknown> | undefined
  if (models) {
    const providers = models.providers as Record<string, unknown> | undefined
    if (providers) {
      for (const key of Object.keys(providers)) {
        existing.add(key)
      }
    }
  }

  return { referenced, existing }
}

/** Get default value for a schema type */
export function getDefaultForSchema(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default

  if (isAnyOfEnum(schema)) {
    const values = extractAnyOfValues(schema)
    return values[0]
  }

  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type
  switch (type) {
    case 'string': return ''
    case 'integer':
    case 'number': return schema.minimum ?? 0
    case 'boolean': return false
    case 'object': return {}
    case 'array': return []
    default: return ''
  }
}
