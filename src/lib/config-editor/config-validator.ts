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

// ─── Public API ────────────────────────────────────────────────────

/**
 * Validate config data against a JSON Schema.
 * Returns empty array if valid.
 */
export function validateConfig(
  schema: JsonSchema,
  config: Record<string, unknown>,
): ValidationError[] {
  const ajv = getAjv()

  // Remove cached schema to avoid stale validator
  const key = '__teamclaw_config__'
  ajv.removeSchema(key)

  const validate = ajv.compile({ ...schema, $id: key })
  const valid = validate(config)

  if (valid) return []

  return (validate.errors ?? []).map((err) => ({
    path: ajvPathToDotPath(err.instancePath, err.params),
    message: formatErrorMessage(err),
    keyword: err.keyword,
    schemaPath: err.schemaPath,
  }))
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
