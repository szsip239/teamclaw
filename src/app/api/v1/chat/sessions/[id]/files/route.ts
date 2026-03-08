import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, resolveExternalSessionFilePath } from '@/lib/session-files/helpers'
import * as hostFileOps from '@/lib/session-files/host-file-ops'
import type { SessionFileZone } from '@/lib/session-files/helpers'
import type { SessionFileListResponse, SessionFileEntry } from '@/types/session-files'

// GET /api/v1/chat/sessions/[id]/files — list files in a session zone
export const GET = withAuth(
  withPermission('chat:use', async (req, ctx) => {
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

    const url = new URL(req.url)
    const zone = (url.searchParams.get('zone') || 'input') as SessionFileZone
    if (zone !== 'input' && zone !== 'output') {
      return NextResponse.json({ error: 'Invalid zone parameter' }, { status: 400 })
    }
    const dir = url.searchParams.get('dir') || ''

    // Validate dir if provided
    if (dir && (dir.includes('..') || dir.includes('\0') || dir.startsWith('/'))) {
      return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 })
    }

    let entries: SessionFileEntry[]
    try {
      if (instance?.containerId) {
        const resolvedPath = resolveSessionFilePath(
          session.agentId, session.id, zone, dir || undefined,
        )
        entries = await dockerManager.listContainerDir(instance.containerId, resolvedPath)
      } else if (instance?.workspacePath) {
        const hostPath = resolveExternalSessionFilePath(
          instance.workspacePath, session.agentId, session.id, zone, dir || undefined,
        )
        entries = await hostFileOps.listDir(hostPath, instance.workspacePath)
      } else {
        return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
      }
    } catch {
      entries = []
    }

    const response: SessionFileListResponse = { files: entries, zone, dir: dir || '' }
    return NextResponse.json(response)
  }),
)
