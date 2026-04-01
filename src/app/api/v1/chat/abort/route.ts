import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { activeRuns } from '@/lib/chat/active-runs'
import { saveLiveSnapshot } from '@/lib/chat/snapshot-helpers'
import { z } from 'zod'

const abortSchema = z.object({
  instanceId: z.string().min(1),
  agentId: z.string().min(1),
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
      const { instanceId, agentId } = body
      const sessionKey = `agent:${agentId}:tc:${user.id}`

      // Ensure gateway is connected
      await ensureRegistryInitialized()
      const client = registry.getClient(instanceId)
      const adapter = registry.getAdapter(instanceId)
      if (!client || !adapter) {
        return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
      }

      // Send chat.abort to the OpenClaw gateway
      try {
        await adapter.abortChat(client, sessionKey)
      } catch (err) {
        // Log but don't fail — the run may have already finished
        console.warn('[chat/abort] Gateway abort failed:', (err as Error).message)
      }

      // Clean up activeRuns for the session
      const session = await prisma.chatSession.findFirst({
        where: { userId: user.id, instanceId, agentId, isActive: true },
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
          await saveLiveSnapshot(session.id, client, sessionKey, instance?.containerId)
        } catch {
          // Non-fatal: snapshot might fail if run was very short
        }
      }

      return NextResponse.json({ status: 'aborted' })
    }),
  ),
)
