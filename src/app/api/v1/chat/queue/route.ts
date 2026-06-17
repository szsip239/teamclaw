import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { buildChatRuntimeSessionKey, toDbChatRuntime } from '@/lib/chat/runtime'
import { buildPiChatSendParams } from '@/lib/chat/pi-runtime-gateway'
import { getRuntimeGatewayClient } from '@/lib/chat/runtime-gateway'
import { z } from 'zod'

const queueSchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
  runtime: z.enum(['openclaw', 'pi']).default('openclaw'),
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
      const { instanceId, agentId, runtime, message, attachments } = body
      const dbRuntime = toDbChatRuntime(runtime)
      const sessionKey = buildChatRuntimeSessionKey(runtime, agentId, user.id)

      let piCwd: string | null = null
      if (runtime === 'pi') {
        await ensureRegistryInitialized()
        const openclawClient = registry.getClient(instanceId)
        const adapter = registry.getAdapter(instanceId)
        if (!openclawClient || !adapter) {
          return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
        }
        const agent = await adapter.getAgent(openclawClient, agentId)
        if (!agent.workspace) {
          return NextResponse.json({ error: 'Agent workspace is not available' }, { status: 502 })
        }
        piCwd = agent.workspace
      }

      const lease = await getRuntimeGatewayClient(instanceId, runtime).catch((err) => {
        console.warn('[chat/queue] Runtime client unavailable:', (err as Error).message)
        return null
      })
      if (!lease) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
      }
      const adapter = runtime === 'openclaw' ? registry.getAdapter(instanceId) : null

      // Update session lastMessageAt + messageCount
      await prisma.chatSession.updateMany({
        where: { userId: user.id, instanceId, agentId, runtime: dbRuntime, isActive: true },
        data: { lastMessageAt: new Date(), messageCount: { increment: 1 } },
      })

      // Send to gateway — it will queue the message if a run is active
      const idempotencyKey = randomUUID()
      try {
        if (runtime === 'pi') {
          if (!piCwd) throw new Error('Agent workspace is not available')
          await lease.client.request(
            'chat.send',
            buildPiChatSendParams({
              sessionKey,
              message,
              idempotencyKey,
              cwd: piCwd,
              attachments: attachments?.length ? attachments : undefined,
            }),
          )
        } else {
          if (!adapter) {
            return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
          }
          await adapter.sendMessage(lease.client, sessionKey, message, idempotencyKey, {
            attachments: attachments?.length ? attachments : undefined,
          })
        }
      } catch (err) {
        return NextResponse.json(
          { error: `Gateway error: ${(err as Error).message}` },
          { status: 502 },
        )
      } finally {
        lease.release()
      }

      return NextResponse.json({ status: 'queued', idempotencyKey })
    }),
  ),
)
