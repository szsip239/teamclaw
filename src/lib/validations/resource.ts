import { z } from 'zod'

const envVarRegex = /^[A-Z_][A-Z0-9_]*$/

const modelDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  reasoning: z.boolean().optional(),
  input: z.array(z.string()).optional(),
  cost: z.object({
    input: z.number(),
    output: z.number(),
    cacheRead: z.number().optional(),
    cacheWrite: z.number().optional(),
  }).optional(),
  contextWindow: z.number().optional(),
  maxTokens: z.number().optional(),
})

const resourceConfigSchema = z.object({
  baseUrl: z.string().url('请输入有效的 URL').optional(),
  apiType: z.string().optional(),
  envVarName: z.string().regex(envVarRegex, '环境变量名格式不正确').optional(),
  authHeader: z.boolean().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  models: z.array(modelDefinitionSchema).optional(),
})

export const createResourceSchema = z.object({
  name: z.string().min(1, '名称不能为空').max(100),
  type: z.enum(['MODEL', 'TOOL']),
  provider: z.string().min(1, '请选择 Provider'),
  apiKey: z.string().min(1, '请提供 API Key'),
  config: resourceConfigSchema.optional(),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
})

export type CreateResourceInput = z.infer<typeof createResourceSchema>

export const updateResourceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(['MODEL', 'TOOL']).optional(),
  provider: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  config: resourceConfigSchema.optional(),
  description: z.string().max(2000).optional().nullable(),
  isDefault: z.boolean().optional(),
})

export type UpdateResourceInput = z.infer<typeof updateResourceSchema>
