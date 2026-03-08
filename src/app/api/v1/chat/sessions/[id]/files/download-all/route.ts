import { NextResponse } from 'next/server'
import { Readable } from 'stream'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, resolveExternalSessionFilePath } from '@/lib/session-files/helpers'
import * as hostFileOps from '@/lib/session-files/host-file-ops'

// GET /api/v1/chat/sessions/[id]/files/download-all — download output/ as tar.gz
export const GET = withAuth(
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

    const instance = await prisma.instance.findUnique({ where: { id: session.instanceId } })

    try {
      if (instance?.containerId) {
        const outputPath = resolveSessionFilePath(
          session.agentId, session.id, 'output',
        )
        const archiveStream = await dockerManager.downloadDirAsArchive(instance.containerId, outputPath)
        const webStream = Readable.toWeb(Readable.from(archiveStream)) as ReadableStream

        return new NextResponse(webStream, {
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': 'attachment; filename="session-output.tar.gz"',
          },
        })
      } else if (instance?.workspacePath) {
        const hostPath = resolveExternalSessionFilePath(
          instance.workspacePath, session.agentId, session.id, 'output',
        )
        const archiveStream = hostFileOps.downloadDirAsArchive(hostPath, instance.workspacePath)

        return new NextResponse(archiveStream, {
          headers: {
            'Content-Type': 'application/gzip',
            'Content-Disposition': 'attachment; filename="session-output.tar.gz"',
          },
        })
      } else {
        return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
      }
    } catch {
      // Output directory doesn't exist yet
      return new NextResponse(null, { status: 204 })
    }
  }),
)
