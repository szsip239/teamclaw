import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  withAuth,
  withPermission,
  param,
  paramArray,
  type AuthContext,
} from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://rag:8000'

// GET /api/v1/knowledge-bases/[id]/artifacts/[...path]
// Proxies to RAG service's /artifacts/ static file server
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const pathSegments = paramArray(ctx, 'path')

    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb || !isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    try {
      // Proxy to RAG service: /artifacts/{path already contains kbId/docId/...}
      const artifactPath = pathSegments.map(encodeURIComponent).join('/')
      const ragUrl = `${RAG_SERVICE_URL}/artifacts/${artifactPath}`

      const res = await fetch(ragUrl)
      if (!res.ok) {
        return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
      }

      const contentType = res.headers.get('content-type') || 'application/octet-stream'
      const body = await res.arrayBuffer()

      return new NextResponse(Buffer.from(body), {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
        },
      })
    } catch {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 })
    }
  }),
)
