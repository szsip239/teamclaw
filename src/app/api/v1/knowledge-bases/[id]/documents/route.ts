import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { hasOcrDocument } from '@/lib/knowledge-base/file-storage'
import { getDocumentIndexInfo } from '@/lib/knowledge-base/rag-client'

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

    const serialized = await Promise.all(documents.map(async (doc) => {
      const indexInfo = await getDocumentIndexInfo(id, doc.docId).catch(() => null)
      return {
        id: doc.id,
        docId: doc.docId,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        status: doc.status,
        jobId: doc.jobId,
        errorMessage: doc.errorMessage,
        hasOcrContent: await hasOcrDocument(id, doc.docId),
        indexInfo: indexInfo ? {
          profileStatus: indexInfo.profile_status,
          profileDetail: indexInfo.profile_detail,
          summary: indexInfo.summary,
          docType: indexInfo.doc_type,
          keywords: indexInfo.keywords,
          titleAliases: indexInfo.title_aliases,
          chapterSummary: indexInfo.chapter_summary,
          pageCount: indexInfo.page_count,
          indexedPageCount: indexInfo.indexed_page_count,
          indexRowCount: indexInfo.index_row_count,
          embeddedRowCount: indexInfo.embedded_row_count,
          updatedAt: indexInfo.updated_at,
        } : null,
        createdAt: doc.createdAt.toISOString(),
        updatedAt: doc.updatedAt.toISOString(),
      }
    }))

    return NextResponse.json({
      documents: serialized,
    })
  }),
)
