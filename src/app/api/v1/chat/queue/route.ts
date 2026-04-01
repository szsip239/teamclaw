import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { z } from 'zod'

const queueSchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
  message: z.string().min(1),
  attachments: z
    .array(
      z.object({
        fileName: z.string(),
        mimeType: z.string(),
        content: z.string(),
      }),
    )
    .optional(),
})

// POST /api/v1/chat/queue — Queue a message while agent is running
// Lightweight: sends chat.send to gateway via WebSocket and returns immediately.
// The gateway's queue system (default: collect mode) handles serialization.
export const POST = withAuth(
  withPermission(
    'chat:use',
    withValidation(queueSchema, async (_req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: z.infer<typeof queueSchema>
      }
      const { instanceId, agentId, message, attachments } = body
      const sessionKey = `agent:${agentId}:tc:${user.id}`

      await ensureRegistryInitialized()
      const client = registry.getClient(instanceId)
      const adapter = registry.getAdapter(instanceId)
      if (!client || !adapter) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
      }

      // Update session lastMessageAt + messageCount
      await prisma.chatSession.updateMany({
        where: { userId: user.id, instanceId, agentId, isActive: true },
        data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
      })

      // Send to gateway — it will queue the message if a run is active
      const idempotencyKey = randomUUID()
      try {
        await adapter.sendMessage(client, sessionKey, message, idempotencyKey, {
          attachments: attachments?.length ? attachments : undefined,
        })
      } catch (err) {
        return NextResponse.json(
          { error: `Gateway error: ${(err as Error).message}` },
          { status: 502 },
        )
      }

      return NextResponse.json({ status: 'queued', idempotencyKey })
    }),
  ),
)
