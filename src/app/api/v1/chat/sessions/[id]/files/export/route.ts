import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath, resolveExternalSessionFilePath } from '@/lib/session-files/helpers'
import * as hostFileOps from '@/lib/session-files/host-file-ops'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB — exports are images/PDFs, much smaller than input files

// POST /api/v1/chat/sessions/[id]/files/export — save exported chat to output/
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
    if (!instance?.containerId && !instance?.workspacePath) {
      return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 20MB limit' }, { status: 400 })
    }

    // Validate filename
    const fileName = file.name
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\0')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
    }

    // Only allow PNG and PDF extensions
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (ext !== 'png' && ext !== 'pdf') {
      return NextResponse.json({ error: 'Only PNG and PDF exports are allowed' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    try {
      if (instance.containerId) {
        const containerDir = resolveSessionFilePath(session.agentId, session.id, 'output')
        await dockerManager.uploadFileToContainer(instance.containerId, containerDir, fileName, buffer)
      } else {
        const hostDir = resolveExternalSessionFilePath(
          instance.workspacePath!, session.agentId, session.id, 'output',
        )
        await hostFileOps.writeFile(hostDir, fileName, buffer, instance.workspacePath!)
      }
    } catch (err) {
      console.error('[export] save failed:', err)
      return NextResponse.json(
        { error: `Export failed: ${(err as Error).message}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, fileName })
  }),
)
