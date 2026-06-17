import { randomUUID } from 'crypto'
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

    // Only interact with the gateway if THIS session is the active one.
    // Inactive (archived) sessions share the same sessionId (gateway key)
    // with the active session — calling sessions.delete would destroy the
    // active session's gateway context.
    if (session.isActive) {
      try {
        await ensureRegistryInitialized()
        const client = registry.getClient(session.instanceId)
        if (client) {
          // Send /new to trigger memory dump before losing the conversation.
          try {
            await client.request('chat.send', {
              sessionKey: session.sessionId,
              message: '/new',
              idempotencyKey: randomUUID(),
            })
          } catch {
            // /new failed — fall back to direct delete
            try {
              const adapter = registry.getAdapter(session.instanceId)
              if (adapter) await adapter.deleteSession(client, session.sessionId)
            } catch { /* offline */ }
          }
        }
      } catch {
        // Gateway might be offline — continue with DB deletion
      }
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

    // If the deleted session was active and /new was sent, the gateway now has
    // a fresh session with a greeting. Create a new DB session so the user
    // sees it immediately when clicking this agent — no need to click "new conversation".
    if (session.isActive) {
      await prisma.chatSession.create({
        data: {
          userId: session.userId,
          instanceId: session.instanceId,
          agentId: session.agentId,
          runtime: session.runtime,
          sessionId: session.sessionId,
          isActive: true,
        },
      })
    }

    return new NextResponse(null, { status: 204 })
  }),
)
