import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { openUploadedFile } from '@/lib/knowledge-base/file-storage'

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://rag:8000'

// GET /api/v1/knowledge-bases/[id]/documents/[docId]/file
// Streams the original PDF (used by the chat-side PDF preview drawer).
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

    const etag = `W/"${doc.id}-${doc.updatedAt.getTime()}-${doc.fileSize}"`
    const cacheHeaders = {
      'Cache-Control': 'private, max-age=3600, stale-while-revalidate=86400',
      ETag: etag,
    }
    const rangeHeader = _req.headers.get('range')
    if (!rangeHeader && etagMatches(_req.headers.get('if-none-match'), etag)) {
      return new NextResponse(null, { status: 304, headers: cacheHeaders })
    }

    // RAG service archives the source PDF at /artifacts/{kbId}/{docId}/source.pdf
    const artifactPath = [kbId, doc.docId, 'source.pdf'].map(encodeURIComponent).join('/')
    const res = await fetch(`${RAG_SERVICE_URL}/artifacts/${artifactPath}`, {
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    })
    if (!res.ok) {
      const uploaded = await openUploadedFile(kbId, doc.fileName, rangeHeader)
      if (!uploaded) {
        return NextResponse.json({ error: 'Source PDF not found' }, { status: 404 })
      }

      const fallbackHeaders = new Headers({
        ...cacheHeaders,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(uploaded.size),
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
        'X-Content-Type-Options': 'nosniff',
      })
      if (uploaded.contentRange) {
        fallbackHeaders.set('Content-Range', uploaded.contentRange)
      }

      return new NextResponse(uploaded.body, {
        status: uploaded.status,
        headers: fallbackHeaders,
      })
    }

    const headers = new Headers({
      ...cacheHeaders,
      'Content-Type': res.headers.get('content-type') || 'application/pdf',
      // inline so the browser's built-in PDF viewer renders it inside an iframe
      'Content-Disposition': `inline; filename="${encodeURIComponent(doc.fileName)}"`,
      'X-Content-Type-Options': 'nosniff',
    })
    copyHeader(res.headers, headers, 'accept-ranges')
    copyHeader(res.headers, headers, 'content-length')
    copyHeader(res.headers, headers, 'content-range')
    copyHeader(res.headers, headers, 'last-modified')

    return new NextResponse(res.body, {
      status: res.status === 206 ? 206 : 200,
      headers: {
        ...Object.fromEntries(headers.entries()),
      },
    })
  }),
)

function copyHeader(from: Headers, to: Headers, name: string) {
  const value = from.get(name)
  if (value) to.set(name, value)
}

function etagMatches(ifNoneMatch: string | null, etag: string) {
  if (!ifNoneMatch) return false
  return ifNoneMatch
    .split(',')
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === '*')
}
