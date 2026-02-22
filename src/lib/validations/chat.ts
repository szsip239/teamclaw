import { z } from 'zod'

export const sendMessageSchema = z.object({
  instanceId: z.string().min(1, '请选择实例'),
  agentId: z.string().min(1, '请选择 Agent'),
  message: z.string().min(1, '消息不能为空').max(32000, '消息最多32000个字符'),
  sessionId: z.string().optional(), // TeamClaw ChatSession ID — targets a specific conversation
  attachments: z.array(z.object({
    name: z.string().max(255),
    content: z.string(),       // base64 (no data:... prefix)
    mimeType: z.string().max(100),
  })).max(5).optional(),       // max 5 attachments
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
