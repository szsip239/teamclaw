import { NextResponse } from 'next/server'
import { Readable } from 'stream'
import tar from 'tar-stream'
import { createGzip } from 'zlib'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, resolveExternalSessionFilePath } from '@/lib/session-files/helpers'
import * as hostFileOps from '@/lib/session-files/host-file-ops'
import { fromDbChatRuntime } from '@/lib/chat/runtime'
import type { ChatSession } from '@/generated/prisma'

type ArchiveFile = {
  archivePath: string
  content: Buffer
}

async function resolveDownloadSessions(id: string, userId: string): Promise<ChatSession[]> {
  const session = await prisma.chatSession.findUnique({ where: { id } })
  if (session) {
    if (session.userId !== userId) {
      throw Object.assign(new Error('No access to this session'), { status: 403 })
    }
    return [session]
  }

  const sessions = await prisma.chatSession.findMany({
    where: { userId, conversationGroupId: id },
    orderBy: { createdAt: 'asc' },
  })
  if (sessions.length === 0) {
    throw Object.assign(new Error('Session not found'), { status: 404 })
  }
  return sessions
}

function archivePathForSession(session: ChatSession, relativePath: string, grouped: boolean): string {
  if (!grouped) return relativePath
  return `${fromDbChatRuntime(session.runtime)}/${relativePath}`
}

async function collectContainerOutputFiles(
  containerId: string,
  session: ChatSession,
  grouped: boolean,
  dir = '',
): Promise<ArchiveFile[]> {
  const outputDir = resolveSessionFilePath(session.agentId, session.id, 'output', dir || undefined)
  const entries = await dockerManager.listContainerDir(containerId, outputDir)
  const files: ArchiveFile[] = []

  for (const entry of entries) {
    const relativePath = dir ? `${dir}/${entry.path}` : entry.path
    if (entry.type === 'directory') {
      files.push(...await collectContainerOutputFiles(containerId, session, grouped, relativePath))
      continue
    }

    const filePath = resolveSessionFilePath(session.agentId, session.id, 'output', relativePath)
    files.push({
      archivePath: archivePathForSession(session, relativePath, grouped),
      content: await dockerManager.downloadFileFromContainer(containerId, filePath),
    })
  }

  return files
}

async function collectExternalOutputFiles(
  workspacePath: string,
  session: ChatSession,
  grouped: boolean,
  dir = '',
): Promise<ArchiveFile[]> {
  const outputDir = resolveExternalSessionFilePath(
    workspacePath,
    session.agentId,
    session.id,
    'output',
    dir || undefined,
  )
  const entries = await hostFileOps.listDir(outputDir, workspacePath)
  const files: ArchiveFile[] = []

  for (const entry of entries) {
    const relativePath = dir ? `${dir}/${entry.path}` : entry.path
    if (entry.type === 'directory') {
      files.push(...await collectExternalOutputFiles(workspacePath, session, grouped, relativePath))
      continue
    }

    const filePath = resolveExternalSessionFilePath(
      workspacePath,
      session.agentId,
      session.id,
      'output',
      relativePath,
    )
    files.push({
      archivePath: archivePathForSession(session, relativePath, grouped),
      content: await hostFileOps.readFile(filePath, workspacePath),
    })
  }

  return files
}

function createGzipTarStream(files: ArchiveFile[]): ReadableStream {
  const pack = tar.pack()
  const gzip = createGzip()
  const stream = pack.pipe(gzip)

  void (async () => {
    try {
      for (const file of files) {
        await new Promise<void>((resolve, reject) => {
          pack.entry({ name: file.archivePath, size: file.content.length }, file.content, (err) => {
            if (err) reject(err)
            else resolve()
          })
        })
      }
      pack.finalize()
    } catch (err) {
      pack.destroy(err instanceof Error ? err : new Error('Failed to create archive'))
    }
  })()

  return Readable.toWeb(stream) as ReadableStream
}

// GET /api/v1/chat/sessions/[id]/files/download-all — download output/ as tar.gz
export const GET = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    try {
      const sessions = await resolveDownloadSessions(id, ctx.user.id)
      const primarySession = sessions[0]
      const instance = await prisma.instance.findUnique({ where: { id: primarySession.instanceId } })
      const grouped = sessions.length > 1
      let files: ArchiveFile[]

      if (instance?.containerId) {
        files = (
          await Promise.all(
            sessions.map((session) =>
              collectContainerOutputFiles(instance.containerId!, session, grouped),
            ),
          )
        ).flat()
      } else if (instance?.workspacePath) {
        files = (
          await Promise.all(
            sessions.map((session) =>
              collectExternalOutputFiles(instance.workspacePath!, session, grouped),
            ),
          )
        ).flat()
      } else {
        return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
      }

      if (files.length === 0) {
        return new NextResponse(null, { status: 204 })
      }

      return new NextResponse(createGzipTarStream(files), {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Disposition': 'attachment; filename="session-output.tar.gz"',
        },
      })
    } catch (err) {
      const status = typeof (err as { status?: unknown }).status === 'number'
        ? (err as { status: number }).status
        : undefined
      if (status) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : 'Failed to download files' },
          { status },
        )
      }
      // Output directory doesn't exist yet
      return new NextResponse(null, { status: 204 })
    }
  }),
)
