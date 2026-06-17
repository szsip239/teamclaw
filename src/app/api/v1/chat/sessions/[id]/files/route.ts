import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, resolveExternalSessionFilePath } from '@/lib/session-files/helpers'
import * as hostFileOps from '@/lib/session-files/host-file-ops'
import type { SessionFileZone } from '@/lib/session-files/helpers'
import type { SessionFileListResponse, SessionFileEntry } from '@/types/session-files'
import type { ChatSession } from '@/generated/prisma'

type ResolveReadableSessionsResult =
  | { sessions: ChatSession[] }
  | { error: NextResponse }

async function resolveReadableSessions(
  id: string,
  userId: string,
): Promise<ResolveReadableSessionsResult> {
  const session = await prisma.chatSession.findUnique({ where: { id } })
  if (session && session.userId !== userId) {
    return { error: NextResponse.json({ error: 'No access to this session' }, { status: 403 }) }
  }

  const conversationGroupId = session?.conversationGroupId ?? session?.id ?? id
  const sessions = await prisma.chatSession.findMany({
    where: {
      userId,
      OR: [
        { id: conversationGroupId },
        { conversationGroupId },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })

  if (sessions.length > 0) return { sessions }
  if (session) return { sessions: [session] }
  return { error: NextResponse.json({ error: 'Session not found' }, { status: 404 }) }
}

// GET /api/v1/chat/sessions/[id]/files — list files in a session zone
export const GET = withAuth(
  withPermission('chat:use', async (req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

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

    const resolved = await resolveReadableSessions(id, ctx.user.id)
    if ('error' in resolved) return resolved.error

    const sessions = zone === 'output' ? resolved.sessions : resolved.sessions.slice(0, 1)
    const primarySession = sessions[0]
    if (!primarySession) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const instance = await prisma.instance.findUnique({ where: { id: primarySession.instanceId } })

    let entries: SessionFileEntry[]
    try {
      if (instance?.containerId) {
        entries = (
          await Promise.all(sessions.map(async (session) => {
            const resolvedPath = resolveSessionFilePath(
              session.agentId, session.id, zone, dir || undefined,
            )
            const sessionEntries = await dockerManager.listContainerDir(
              instance.containerId!,
              resolvedPath,
            )
            return sessionEntries.map((entry) => ({
              ...entry,
              sourceSessionId: session.id,
            }))
          }))
        ).flat()
      } else if (instance?.workspacePath) {
        entries = (
          await Promise.all(sessions.map(async (session) => {
            const hostPath = resolveExternalSessionFilePath(
              instance.workspacePath!,
              session.agentId,
              session.id,
              zone,
              dir || undefined,
            )
            const sessionEntries = await hostFileOps.listDir(hostPath, instance.workspacePath!)
            return sessionEntries.map((entry) => ({
              ...entry,
              sourceSessionId: session.id,
            }))
          }))
        ).flat()
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
