import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath } from '@/lib/session-files/helpers'
import type { SessionFileZone } from '@/lib/session-files/helpers'
import type { SessionFileListResponse } from '@/types/session-files'

// GET /api/v1/chat/sessions/[id]/files — list files in a session zone
export const GET = withAuth(
  withPermission('chat:use', async (req, ctx) => {
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

    const url = new URL(req.url)
    const zone = (url.searchParams.get('zone') || 'input') as SessionFileZone
    if (zone !== 'input' && zone !== 'output') {
      return NextResponse.json({ error: '无效的 zone 参数' }, { status: 400 })
    }
    const dir = url.searchParams.get('dir') || ''

    // Validate dir if provided
    if (dir && (dir.includes('..') || dir.includes('\0') || dir.startsWith('/'))) {
      return NextResponse.json({ error: '无效的目录路径' }, { status: 400 })
    }

    const resolvedPath = resolveSessionFilePath(
      session.agentId, session.id, zone, dir || undefined,
    )

    try {
      const entries = await dockerManager.listContainerDir(instance.containerId, resolvedPath)
      const response: SessionFileListResponse = {
        files: entries,
        zone,
        dir: dir || '',
      }
      return NextResponse.json(response)
    } catch {
      // Directory doesn't exist yet — return empty
      const response: SessionFileListResponse = { files: [], zone, dir: dir || '' }
      return NextResponse.json(response)
    }
  }),
)
