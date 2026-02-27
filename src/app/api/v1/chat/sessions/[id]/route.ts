import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker/manager'
import { buildSessionBasePath } from '@/lib/session-files/helpers'

// DELETE /api/v1/chat/sessions/[id] — delete a chat session
export const DELETE = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({
      where: { id },
    })

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: 'No access to delete this session' }, { status: 403 })
    }

    // Try to delete the gateway session (best-effort)
    try {
      await ensureRegistryInitialized()
      const adapter = registry.getAdapter(session.instanceId)
      const client = registry.getClient(session.instanceId)
      if (adapter && client) {
        await adapter.deleteSession(client, session.sessionId)
      }
    } catch {
      // Gateway might be offline — continue with DB deletion
    }

    // Clean up session files in the container (best-effort)
    try {
      const instance = await prisma.instance.findUnique({
        where: { id: session.instanceId },
        select: { containerId: true },
      })
      if (instance?.containerId) {
        const sessionDir = buildSessionBasePath(session.agentId, session.id)
        await dockerManager.removeContainerDir(instance.containerId, sessionDir)
      }
    } catch {
      // Container might be stopped — not fatal
    }

    await prisma.chatSession.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  }),
)
