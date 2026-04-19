import Ajv, { type ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import type { JsonSchema } from '@/types/config-editor'

// ─── Types ─────────────────────────────────────────────────────────

export interface ValidationError {
  /** Dot-notation path: "gateway.port" */
  path: string
  /** Human-readable error in Chinese */
  message: string
  /** ajv keyword: "type", "required", "minimum"... */
  keyword: string
  /** JSON Schema path */
  schemaPath: string
}

// ─── Singleton ─────────────────────────────────────────────────────

let ajvInstance: Ajv | null = null

function getAjv(): Ajv {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      allErrors: true,
      verbose: true,
      strict: false,
    })
    addFormats(ajvInstance)
  }
  return ajvInstance
}

// ─── Schema Pre-Processing ─────────────────────────────────────────
//
// OpenClaw 2026.4.15's config.schema violates JSON Schema spec:
//   - Contains $ref like "#/$defs/secretInput" (absolute root path)
//   - But $defs is deeply nested under `plugins.*.config.$defs` — not at root
//
// Ajv resolves "#/$defs/*" against the root per JSON Pointer spec, so compile
// throws "can't resolve reference #/$defs/secretInput".
//
// Fix: walk the schema tree, collect all nested $defs into a root $defs before
// passing to Ajv. If duplicate names appear at different nesting levels, the
// last one wins (late-merge) — matching OpenClaw's own runtime behavior.
function flattenDefs(schema: JsonSchema): JsonSchema {
  const rootDefs: Record<string, unknown> = {
    ...((schema as { $defs?: Record<string, unknown> }).$defs ?? {}),
  }

  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      for (const item of node) walk(item)
      return
    }
    const obj = node as Record<string, unknown>
    const nested = obj.$defs
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      Object.assign(rootDefs, nested as Record<string, unknown>)
    }
    for (const [key, val] of Object.entries(obj)) {
      if (key === '$defs') continue
      walk(val)
    }
  }
  walk(schema)

  return { ...schema, $defs: rootDefs } as JsonSchema
}

// ─── Public API ────────────────────────────────────────────────────

/**
 * Validate config data against a JSON Schema.
 * Returns empty array if valid.
 *
 * Ajv compile may throw when the schema contains unresolvable $refs (e.g.
 * OpenClaw's schema where $defs are nested). Such exceptions are caught and
 * swallowed so that a broken schema never blocks saves — the server-side
 * gateway will still validate, so we degrade to "skip client validation"
 * rather than freeze the UI.
 */
export function validateConfig(
  schema: JsonSchema,
  config: Record<string, unknown>,
): ValidationError[] {
  const ajv = getAjv()
  const key = '__teamclaw_config__'
  ajv.removeSchema(key)

  try {
    const processed = flattenDefs(schema)
    const validate = ajv.compile({ ...processed, $id: key })
    const valid = validate(config)

    if (valid) return []

    return (validate.errors ?? []).map((err) => ({
      path: ajvPathToDotPath(err.instancePath, err.params),
      message: formatErrorMessage(err),
      keyword: err.keyword,
      schemaPath: err.schemaPath,
    }))
  } catch (err) {
    console.warn(
      '[config-validator] Ajv compile failed, skipping client validation. ' +
      'Server will validate on save. Reason:',
      (err as Error).message,
    )
    return []
  }
}

// ─── Helpers ───────────────────────────────────────────────────────

/** Convert ajv's "/gateway/port" to "gateway.port" */
function ajvPathToDotPath(
  instancePath: string,
  params: Record<string, unknown>,
): string {
  let path = instancePath.replace(/^\//, '').replace(/\//g, '.')
  if (params?.missingProperty) {
    path = path
      ? `${path}.${params.missingProperty}`
      : String(params.missingProperty)
  }
  return path
}

/** Map ajv error keywords to Chinese messages */
function formatErrorMessage(err: ErrorObject): string {
  switch (err.keyword) {
    case 'type':
      return `类型错误：应为 ${err.params.type}`
    case 'required':
      return `必填字段：${err.params.missingProperty}`
    case 'minimum':
      return `不能小于 ${err.params.limit}`
    case 'maximum':
      return `不能大于 ${err.params.limit}`
    case 'minLength':
      return `长度不能少于 ${err.params.limit} 个字符`
    case 'maxLength':
      return `长度不能超过 ${err.params.limit} 个字符`
    case 'pattern':
      return `格式不匹配`
    case 'enum':
      return `值不在允许范围内`
    case 'const':
      return `值必须为 ${JSON.stringify(err.params.allowedValue)}`
    case 'anyOf':
      return `不匹配任何允许的格式`
    case 'additionalProperties':
      return `未知属性: ${err.params.additionalProperty}`
    default:
      return err.message ?? '验证失败'
  }
}
