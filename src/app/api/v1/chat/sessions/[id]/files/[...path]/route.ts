import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, paramArray } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import { resolveSessionFilePath } from '@/lib/session-files/helpers'
import type { SessionFileZone } from '@/lib/session-files/helpers'

// GET /api/v1/chat/sessions/[id]/files/[...path] — download a file
export const GET = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const pathSegments = paramArray(ctx, 'path')
    if (pathSegments.length < 2) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }

    const zone = pathSegments[0] as SessionFileZone
    if (zone !== 'input' && zone !== 'output') {
      return NextResponse.json({ error: 'Invalid zone' }, { status: 400 })
    }

    const relativePath = pathSegments.slice(1).join('/')
    if (relativePath.includes('..') || relativePath.includes('\0')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
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

    const filePath = resolveSessionFilePath(
      session.agentId, session.id, zone, relativePath,
    )

    try {
      const data = await dockerManager.downloadFileFromContainer(instance.containerId, filePath)
      const fileName = pathSegments[pathSegments.length - 1]
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
          'Content-Length': String(data.length),
        },
      })
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  }),
)

// DELETE /api/v1/chat/sessions/[id]/files/[...path] — delete a file (input only)
export const DELETE = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing session ID' }, { status: 400 })
    }

    const pathSegments = paramArray(ctx, 'path')
    if (pathSegments.length < 2) {
      return NextResponse.json({ error: 'Invalid path format' }, { status: 400 })
    }

    const zone = pathSegments[0]
    if (zone !== 'input') {
      return NextResponse.json({ error: 'Can only delete files in the input zone' }, { status: 403 })
    }

    const relativePath = pathSegments.slice(1).join('/')
    if (relativePath.includes('..') || relativePath.includes('\0')) {
      return NextResponse.json({ error: 'Invalid file path' }, { status: 400 })
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

    const filePath = resolveSessionFilePath(
      session.agentId, session.id, 'input', relativePath,
    )

    try {
      await dockerManager.removeContainerFile(instance.containerId, filePath)
      return new NextResponse(null, { status: 204 })
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  }),
)
