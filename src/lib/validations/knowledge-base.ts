import { z } from 'zod'

export const createKbSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(2000).optional(),
  scope: z.enum(['GLOBAL', 'DEPARTMENT', 'PERSONAL']).optional(),
  category: z.enum(['INTERNAL', 'EXTERNAL', 'RULES']).optional(),
  departmentId: z.string().optional(),
})

export type CreateKbInput = z.infer<typeof createKbSchema>

export const updateKbSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(2000).optional(),
})

export type UpdateKbInput = z.infer<typeof updateKbSchema>

export const querySchema = z.object({
  question: z.string().min(1, 'Question is required').max(10000),
  generateAnswer: z.boolean().optional().default(true),
  topK: z.number().int().min(1).max(20).optional().default(5),
})

export type QueryInput = z.infer<typeof querySchema>
