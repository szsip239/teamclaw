import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://rag:8000'

// GET /api/v1/knowledge-bases/[id]/documents/[docId]/content
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const docRowId = param(ctx, 'docId')

    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb || !isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const doc = await prisma.knowledgeDocument.findFirst({
      where: { id: docRowId, knowledgeBaseId: kbId },
    })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const artifactPath = [kbId, doc.docId, 'document.md'].map(encodeURIComponent).join('/')
    const res = await fetch(`${RAG_SERVICE_URL}/artifacts/${artifactPath}`)

    if (!res.ok) {
      return NextResponse.json({ error: 'OCR Markdown not found' }, { status: 404 })
    }

    const content = await res.text()
    const fileName = doc.fileName.replace(/\.pdf$/i, '.md')

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': `inline; filename="${encodeURIComponent(fileName)}"`,
        'Cache-Control': 'no-store',
      },
    })
  }),
)
