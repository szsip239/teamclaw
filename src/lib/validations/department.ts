import { z } from 'zod'

export const createDepartmentSchema = z.object({
  name: z.string().min(2, '部门名称至少2个字符').max(50, '部门名称最多50个字符'),
  description: z.string().max(256, '描述最多256个字符').optional(),
})

export const updateDepartmentSchema = z.object({
  name: z.string().min(2, '部门名称至少2个字符').max(50, '部门名称最多50个字符').optional(),
  description: z.string().max(256, '描述最多256个字符').nullable().optional(),
})

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>
