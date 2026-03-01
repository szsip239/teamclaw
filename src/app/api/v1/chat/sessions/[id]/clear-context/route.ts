import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { archiveSession } from '@/lib/chat/snapshot-helpers'
import { Prisma } from '@/generated/prisma'

// POST /api/v1/chat/sessions/[id]/clear-context — snapshot messages and reset OpenClaw session
export const POST = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: 'No access to this session' }, { status: 403 })
    }

    if (!session.isActive) {
      return NextResponse.json({ error: 'Session is archived, cannot clear context' }, { status: 400 })
    }

    // Connect to gateway
    await ensureRegistryInitialized().catch(() => {})
    const client = registry.getClient(session.instanceId)
    if (!client) {
      return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
    }

    try {
      // Archive: snapshot messages + delete OpenClaw session (keeps DB session active)
      await archiveSession(id, session.instanceId, session.agentId, session.userId, client, { keepActive: true })

      // Clear liveMessages since context was reset
      await prisma.chatSession.update({
        where: { id },
        data: { liveMessages: Prisma.DbNull },
      })

      return NextResponse.json({ success: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear context'
      return NextResponse.json({ error: message }, { status: 502 })
    }
  }),
)
