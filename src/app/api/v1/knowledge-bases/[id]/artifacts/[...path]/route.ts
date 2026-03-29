import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { extname } from 'path'
import { prisma } from '@/lib/db'
import {
  withAuth,
  withPermission,
  param,
  paramArray,
  type AuthContext,
} from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { resolveArtifactPath } from '@/lib/knowledge-base/file-storage'

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.html': 'text/html',
}

// GET /api/v1/knowledge-bases/[id]/artifacts/[...path]
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const pathSegments = paramArray(ctx, 'path')

    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb || !isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      const filePath = resolveArtifactPath(kbId, ...pathSegments)
      const content = await readFile(filePath)
      const ext = extname(filePath).toLowerCase()
      const mimeType = MIME_TYPES[ext] || 'application/octet-stream'

      return new NextResponse(content, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }
  }),
)
