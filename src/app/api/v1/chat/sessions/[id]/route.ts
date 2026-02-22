import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'

// DELETE /api/v1/chat/sessions/[id] — delete a chat session
export const DELETE = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({
      where: { id },
    })

    if (!session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }

    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: '无权删除此会话' }, { status: 403 })
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

    await prisma.chatSession.delete({ where: { id } })

    return new NextResponse(null, { status: 204 })
  }),
)
