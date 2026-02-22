import { z } from 'zod'

export const grantAccessSchema = z.object({
  departmentId: z.string().min(1, '请选择部门'),
  instanceId: z.string().min(1, '请选择实例'),
  agentIds: z.array(z.string()).nullable().optional(), // null = all agents
})

export const updateAccessSchema = z.object({
  agentIds: z.array(z.string()).nullable(), // null = all agents
})

export type GrantAccessInput = z.infer<typeof grantAccessSchema>
export type UpdateAccessInput = z.infer<typeof updateAccessSchema>
