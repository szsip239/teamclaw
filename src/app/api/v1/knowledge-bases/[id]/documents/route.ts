import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { hasOcrDocument } from '@/lib/knowledge-base/file-storage'

// GET /api/v1/knowledge-bases/[id]/documents
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    const kb = await prisma.knowledgeBase.findUnique({ where: { id } })

    if (!kb) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
    }

    if (!isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const documents = await prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId: id },
      orderBy: { createdAt: 'desc' },
    })

    const serialized = await Promise.all(documents.map(async (doc) => ({
      id: doc.id,
      docId: doc.docId,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      pageCount: doc.pageCount,
      status: doc.status,
      jobId: doc.jobId,
      errorMessage: doc.errorMessage,
      hasOcrContent: await hasOcrDocument(id, doc.docId),
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
    })))

    return NextResponse.json({
      documents: serialized,
    })
  }),
)
