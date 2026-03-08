import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, resolveExternalSessionFilePath } from '@/lib/session-files/helpers'
import * as hostFileOps from '@/lib/session-files/host-file-ops'
import { mkdirSchema } from '@/lib/validations/session-files'

// POST /api/v1/chat/sessions/[id]/files/mkdir — create folder in input/
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

    const result = mkdirSchema.safeParse(body)
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

    if (instance?.containerId) {
      const fullPath = resolveSessionFilePath(
        session.agentId, session.id, 'input', result.data.dir,
      )
      await dockerManager.ensureContainerDir(instance.containerId, fullPath)
    } else if (instance?.workspacePath) {
      const hostPath = resolveExternalSessionFilePath(
        instance.workspacePath, session.agentId, session.id, 'input', result.data.dir,
      )
      await hostFileOps.ensureDir(hostPath, instance.workspacePath)
    } else {
      return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  }),
)
