import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry } from '@/lib/gateway/registry'
import { activeRuns } from '@/lib/chat/active-runs'
import { saveLiveSnapshot } from '@/lib/chat/snapshot-helpers'
import { buildChatRuntimeSessionKey, toDbChatRuntime } from '@/lib/chat/runtime'
import { getRuntimeGatewayClient } from '@/lib/chat/runtime-gateway'
import { z } from 'zod'

const abortSchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
  runtime: z.enum(['openclaw', 'pi']).default('openclaw'),
})

// POST /api/v1/chat/abort — Abort the active agent run for this user+agent
export const POST = withAuth(
  withPermission(
    'chat:use',
    withValidation(abortSchema, async (_req, ctx) => {
      const { user, body } = ctx as {
        user: NonNullable<typeof ctx.user>
        body: z.infer<typeof abortSchema>
      }
      const { instanceId, agentId, runtime } = body
      const dbRuntime = toDbChatRuntime(runtime)
      const sessionKey = buildChatRuntimeSessionKey(runtime, agentId, user.id)

      const lease = await getRuntimeGatewayClient(instanceId, runtime).catch((err) => {
        console.warn('[chat/abort] Runtime client unavailable:', (err as Error).message)
        return null
      })
      if (!lease) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
      }

      // Send chat.abort to the OpenClaw gateway
      try {
        if (runtime === 'pi') {
          await lease.client.request('chat.abort', { sessionKey })
        } else {
          const adapter = registry.getAdapter(instanceId)
          if (!adapter) {
            return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
          }
          await adapter.abortChat(lease.client, sessionKey)
        }
      } catch (err) {
        // Log but don't fail — the run may have already finished
        console.warn('[chat/abort] Gateway abort failed:', (err as Error).message)
      }

      // Clean up activeRuns for the session
      const session = await prisma.chatSession.findFirst({
        where: { userId: user.id, instanceId, agentId, runtime: dbRuntime, isActive: true },
        select: { id: true },
      })
      if (session) {
        activeRuns.delete(session.id)

        // Save a liveMessages snapshot so partial progress isn't lost
        try {
          const instance = await prisma.instance.findUnique({
            where: { id: instanceId },
            select: { containerId: true },
          })
          await saveLiveSnapshot(session.id, lease.client, sessionKey, instance?.containerId)
        } catch {
          // Non-fatal: snapshot might fail if run was very short
        }
      }

      lease.release()
      return NextResponse.json({ status: 'aborted' })
    }),
  ),
)
