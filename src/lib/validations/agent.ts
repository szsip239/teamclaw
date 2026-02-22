import { z } from 'zod'

// ─── Shared sub-schemas ─────────────────────────────────────────────

const agentModelConfigSchema = z.object({
  primary: z.string().optional(),
  list: z.array(z.string()).optional(),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
}).optional()

const agentSandboxConfigSchema = z.object({
  mode: z.enum(['off', 'non-main', 'all']).optional(),
  scope: z.enum(['session', 'agent', 'shared']).optional(),
  workspaceAccess: z.enum(['rw', 'ro', 'none']).optional(),
  setupCommand: z.string().optional(),
}).optional()

const agentToolsConfigSchema = z.object({
  allow: z.array(z.string()).optional(),
  deny: z.array(z.string()).optional(),
}).optional()

const agentSubagentsConfigSchema = z.object({
  model: z.string().optional(),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
  maxConcurrent: z.number().int().positive().optional(),
  archiveAfterMinutes: z.number().int().positive().optional(),
}).optional()

const agentSessionConfigSchema = z.object({
  dmScope: z.enum(['main', 'per-peer', 'per-channel-peer', 'per-account-channel-peer']).optional(),
  reset: z.object({
    mode: z.string().optional(),
    hour: z.number().int().min(0).max(23).optional(),
    idleAfterMinutes: z.number().int().positive().optional(),
  }).optional(),
}).optional()

// ─── Agent config update ────────────────────────────────────────────

export const updateAgentConfigSchema = z.object({
  workspace: z.string().optional(),
  models: agentModelConfigSchema,
  sandbox: agentSandboxConfigSchema,
  tools: agentToolsConfigSchema,
  subagents: agentSubagentsConfigSchema,
  session: agentSessionConfigSchema,
})

export type UpdateAgentConfigInput = z.infer<typeof updateAgentConfigSchema>

// ─── Agent defaults update ──────────────────────────────────────────

export const updateAgentDefaultsSchema = z.object({
  models: agentModelConfigSchema,
  sandbox: agentSandboxConfigSchema,
  tools: agentToolsConfigSchema,
  subagents: agentSubagentsConfigSchema,
  session: agentSessionConfigSchema,
  bootstrapMaxChars: z.number().int().positive().optional(),
})

export type UpdateAgentDefaultsInput = z.infer<typeof updateAgentDefaultsSchema>

// ─── Agent category ────────────────────────────────────────────────

const agentCategorySchema = z.enum(['DEFAULT', 'DEPARTMENT', 'PERSONAL']).optional()

// ─── Create agent ───────────────────────────────────────────────────

export const createAgentSchema = z.object({
  instanceId: z.string().min(1, '请选择实例'),
  id: z
    .string()
    .min(1, 'Agent ID 不能为空')
    .max(50, 'Agent ID 最多50个字符')
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Agent ID 只能包含小写字母、数字、连字符和下划线'),
  workspace: z.string().optional(),
  models: agentModelConfigSchema,
  sandbox: agentSandboxConfigSchema,
  category: agentCategorySchema,
  departmentId: z.string().optional(),
})

export type CreateAgentInput = z.infer<typeof createAgentSchema>

// ─── Classify agent ─────────────────────────────────────────────────

export const classifyAgentSchema = z.object({
  category: z.enum(['DEFAULT', 'DEPARTMENT', 'PERSONAL']),
  departmentId: z.string().optional(),
  ownerId: z.string().optional(),
})

export type ClassifyAgentInput = z.infer<typeof classifyAgentSchema>

// ─── Clone agent ────────────────────────────────────────────────

export const cloneAgentSchema = z.object({
  sourceId: z.string().min(1),
  targetInstanceId: z.string().min(1),
  newAgentId: z
    .string()
    .min(1, 'Agent ID 不能为空')
    .max(50, 'Agent ID 最多50个字符')
    .regex(/^[a-z0-9][a-z0-9_-]*$/, 'Agent ID 只能包含小写字母、数字、连字符和下划线'),
  workspace: z.string().optional(),
  copyFiles: z.boolean().optional().default(true),
})

export type CloneAgentInput = z.infer<typeof cloneAgentSchema>

// ─── Write file ─────────────────────────────────────────────────────

export const writeFileSchema = z.object({
  content: z.string(),
})

export type WriteFileInput = z.infer<typeof writeFileSchema>
