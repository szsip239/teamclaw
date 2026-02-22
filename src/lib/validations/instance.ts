import { z } from 'zod'

// ─── Model Provider ──────────────────────────────────────────────────

const modelProviderSchema = z.object({
  name: z.string().min(1, 'Provider 名称不能为空'),
  apiKey: z.string().min(1, 'API Key 不能为空'),
  api: z.string().optional(),       // e.g., "anthropic-messages"
  baseUrl: z.string().url('请输入有效的 Base URL').optional(),
})

// ─── Docker Config ───────────────────────────────────────────────────

const dockerConfigSchema = z.object({
  imageName: z.string().min(1).optional(),
  env: z.record(z.string(), z.string()).optional(),
  portBindings: z.record(z.string(), z.string()).optional(),
  volumes: z.record(z.string(), z.string()).optional(),
  restartPolicy: z.enum(['no', 'always', 'unless-stopped', 'on-failure']).optional(),
  memoryLimit: z.number().int().positive().optional(),
})

// ─── Create Instance ─────────────────────────────────────────────────

export const createInstanceSchema = z.object({
  name: z
    .string()
    .min(2, '名称至少2个字符')
    .max(64, '名称最多64个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '名称只能包含字母、数字、下划线和连字符'),
  description: z.string().max(256, '描述最多256个字符').optional(),
  // 创建模式: docker 自动部署 | external 连接已有 Gateway
  mode: z.enum(['docker', 'external']).default('docker'),
  // docker 模式下 gatewayUrl/gatewayToken 由系统自动生成，external 模式下必填
  gatewayUrl: z
    .string()
    .url('请输入有效的 URL')
    .regex(/^wss?:\/\//, 'Gateway URL 必须以 ws:// 或 wss:// 开头')
    .optional(),
  gatewayToken: z.string().min(1, 'Gateway Token 不能为空').optional(),
  // Docker 配置
  docker: dockerConfigSchema.optional(),
  // 模型 Provider 配置（写入 openclaw.json）
  modelProvider: modelProviderSchema.optional(),
  // 默认 Agent ID
  defaultAgentId: z.string().min(1).default('main').optional(),
}).refine(
  (data) => {
    // external 模式要求 gatewayUrl 和 gatewayToken
    if (data.mode === 'external') {
      return !!data.gatewayUrl && !!data.gatewayToken
    }
    return true
  },
  {
    message: '外部模式下 Gateway URL 和 Token 为必填',
    path: ['gatewayUrl'],
  },
)

// ─── Update Instance ─────────────────────────────────────────────────

export const updateInstanceSchema = z.object({
  name: z
    .string()
    .min(2, '名称至少2个字符')
    .max(64, '名称最多64个字符')
    .regex(/^[a-zA-Z0-9_-]+$/, '名称只能包含字母、数字、下划线和连字符')
    .optional(),
  description: z.string().max(256, '描述最多256个字符').optional(),
  gatewayUrl: z
    .string()
    .url('请输入有效的 URL')
    .regex(/^wss?:\/\//, 'Gateway URL 必须以 ws:// 或 wss:// 开头')
    .optional(),
  gatewayToken: z.string().min(1, 'Gateway Token 不能为空').optional(),
  docker: dockerConfigSchema.optional(),
})

// ─── Instance Config ─────────────────────────────────────────────────

export const updateInstanceConfigSchema = z.object({
  config: z.record(z.string(), z.unknown()),
})

// ─── Inferred Types ──────────────────────────────────────────────────

export type CreateInstanceInput = z.infer<typeof createInstanceSchema>
export type UpdateInstanceInput = z.infer<typeof updateInstanceSchema>
export type UpdateInstanceConfigInput = z.infer<typeof updateInstanceConfigSchema>
