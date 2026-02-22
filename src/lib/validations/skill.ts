import { z } from 'zod'

const slugRegex = /^[a-z0-9][a-z0-9_-]*$/

export const createSkillSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug 不能为空')
    .max(80, 'Slug 最多80个字符')
    .regex(slugRegex, 'Slug 只能包含小写字母、数字、连字符和下划线'),
  name: z.string().min(1, '名称不能为空').max(100),
  description: z.string().max(2000).optional(),
  emoji: z.string().max(4).optional(),
  category: z.enum(['DEFAULT', 'DEPARTMENT', 'PERSONAL']).optional(),
  departmentIds: z.array(z.string()).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  skillContent: z.string().optional(), // Initial SKILL.md content
})

export type CreateSkillInput = z.infer<typeof createSkillSchema>

export const updateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(slugRegex, 'Slug 只能包含小写字母、数字、连字符和下划线')
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  emoji: z.string().max(4).optional().nullable(),
  category: z.enum(['DEFAULT', 'DEPARTMENT', 'PERSONAL']).optional(),
  departmentIds: z.array(z.string()).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  homepage: z.string().url().max(500).optional().nullable(),
})

export type UpdateSkillInput = z.infer<typeof updateSkillSchema>

export const publishVersionSchema = z.object({
  version: z
    .string()
    .min(1, '版本号不能为空')
    .regex(/^\d+\.\d+\.\d+$/, '版本号格式不正确，请使用 x.y.z 格式'),
  changelog: z.string().max(5000).optional(),
})

export type PublishVersionInput = z.infer<typeof publishVersionSchema>

export const installSkillSchema = z.object({
  instanceId: z.string().min(1, '请选择实例'),
  agentId: z.string().min(1, '请选择 Agent'),
  installPath: z.enum(['workspace', 'global']).default('workspace'),
})

export type InstallSkillInput = z.infer<typeof installSkillSchema>

export const uninstallSkillSchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
  installPath: z.enum(['workspace', 'global']),
})

export type UninstallSkillInput = z.infer<typeof uninstallSkillSchema>

export const writeSkillFileSchema = z.object({
  content: z.string(),
})

export type WriteSkillFileInput = z.infer<typeof writeSkillFileSchema>

export const clawHubSearchSchema = z.object({
  query: z.string().min(1).max(200),
})

export type ClawHubSearchInput = z.infer<typeof clawHubSearchSchema>

export const clawHubPullSchema = z.object({
  slug: z.string().min(1),
  category: z.enum(['DEFAULT', 'DEPARTMENT', 'PERSONAL']).optional(),
  departmentIds: z.array(z.string()).optional(),
})

export type ClawHubPullInput = z.infer<typeof clawHubPullSchema>
