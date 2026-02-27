import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, isSessionPathSafe } from '@/lib/session-files/helpers'
import type { SessionFileEntry } from '@/types/session-files'

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

// POST /api/v1/chat/sessions/[id]/files/upload — upload file to input/
export const POST = withAuth(
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
    if (!instance?.containerId) {
      return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 50MB limit' }, { status: 400 })
    }

    const dir = (formData.get('dir') as string) || ''
    if (dir && !isSessionPathSafe(dir)) {
      return NextResponse.json({ error: 'Invalid directory path' }, { status: 400 })
    }

    // Validate filename
    const fileName = file.name
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\0')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    const containerDir = resolveSessionFilePath(
      session.agentId, session.id, 'input', dir || undefined,
    )

    const buffer = Buffer.from(await file.arrayBuffer())

    try {
      await dockerManager.uploadFileToContainer(instance.containerId, containerDir, fileName, buffer)
    } catch (err) {
      console.error('[session-files] upload failed:', err)
      return NextResponse.json(
        { error: `Upload failed: ${(err as Error).message}` },
        { status: 500 },
      )
    }

    const fileEntry: SessionFileEntry = {
      name: fileName,
      path: dir ? `${dir}/${fileName}` : fileName,
      type: 'file',
      size: file.size,
    }

    return NextResponse.json({ success: true, file: fileEntry })
  }),
)
