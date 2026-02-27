import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath } from '@/lib/session-files/helpers'
import { moveSchema } from '@/lib/validations/session-files'

// POST /api/v1/chat/sessions/[id]/files/move — move file within input/
export const POST = withAuth(
  withPermission('chat:use', async (req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const result = moveSchema.safeParse(body)
    if (!result.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        { status: 400 },
      )
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }
    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: 'No access to this session' }, { status: 403 })
    }

    const instance = await prisma.instance.findUnique({ where: { id: session.instanceId } })
    if (!instance?.containerId) {
      return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
    }

    const sourceFull = resolveSessionFilePath(
      session.agentId, session.id, 'input', result.data.source,
    )
    const targetFull = resolveSessionFilePath(
      session.agentId, session.id, 'input', result.data.target,
    )

    try {
      await dockerManager.moveContainerPath(instance.containerId, sourceFull, targetFull)
      return NextResponse.json({ success: true })
    } catch {
      return NextResponse.json({ error: 'Move failed, source file may not exist' }, { status: 400 })
    }
  }),
)
