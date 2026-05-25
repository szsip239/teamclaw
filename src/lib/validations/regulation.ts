import { z } from 'zod'

export const createTrackerSchema = z.object({
  knowledgeBaseId: z.string().min(1, 'knowledgeBaseId is required'),
  name: z.string().min(1).max(100).optional(),
})

export type CreateTrackerInput = z.infer<typeof createTrackerSchema>

export const updateTrackerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  keywords: z.array(z.string().min(1).max(60)).max(50).optional(),
  notifyChannels: z.array(z.enum(['email', 'wework'])).optional(),
  searchCron: z.string().max(120).nullable().optional(),
})

export type UpdateTrackerInput = z.infer<typeof updateTrackerSchema>

export const updatePendingStatusSchema = z.object({
  status: z.enum(['NEW', 'SEEN', 'APPLIED', 'DISMISSED']),
})

export type UpdatePendingStatusInput = z.infer<typeof updatePendingStatusSchema>
