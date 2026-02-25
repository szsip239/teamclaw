import { NextResponse } from 'next/server'
import { Readable } from 'stream'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath } from '@/lib/session-files/helpers'

// GET /api/v1/chat/sessions/[id]/files/download-all — download output/ as tar.gz
export const GET = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })
    if (!session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }
    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: '无权访问此会话' }, { status: 403 })
    }

    const instance = await prisma.instance.findUnique({ where: { id: session.instanceId } })
    if (!instance?.containerId) {
      return NextResponse.json({ error: '实例未就绪' }, { status: 400 })
    }

    const outputPath = resolveSessionFilePath(
      session.agentId, session.userId, session.id, 'output',
    )

    try {
      const archiveStream = await dockerManager.downloadDirAsArchive(instance.containerId, outputPath)
      const webStream = Readable.toWeb(Readable.from(archiveStream)) as ReadableStream

      return new NextResponse(webStream, {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': 'attachment; filename="session-output.tar.gz"',
        },
      })
    } catch {
      // Output directory doesn't exist yet
      return new NextResponse(null, { status: 204 })
    }
  }),
)
