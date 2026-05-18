import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { updateKbSchema } from '@/lib/validations/knowledge-base'
import { isKbVisible, canManageKb } from '@/lib/knowledge-base/permissions'
import { deleteVectors, getDocumentIndexInfo } from '@/lib/knowledge-base/rag-client'
import { deleteKbDirectory, hasOcrDocument } from '@/lib/knowledge-base/file-storage'

// GET /api/v1/knowledge-bases/[id]
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: {
        createdBy: { select: { name: true } },
        department: { select: { name: true } },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
      },
    })

    if (!kb) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
    }

    if (!isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const documents = await Promise.all(kb.documents.map(async (doc) => {
      const indexInfo = await getDocumentIndexInfo(kb.id, doc.docId).catch(() => null)
      return {
        id: doc.id,
        docId: doc.docId,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        pageCount: doc.pageCount,
        status: doc.status,
        jobId: doc.jobId,
        errorMessage: doc.errorMessage,
        hasOcrContent: await hasOcrDocument(kb.id, doc.docId),
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
      id: kb.id,
      name: kb.name,
      description: kb.description,
      scope: kb.scope,
      category: kb.category,
      departmentId: kb.departmentId,
      departmentName: kb.department?.name ?? null,
      createdById: kb.createdById,
      creatorName: kb.createdBy.name,
      documentCount: kb.documentCount,
      createdAt: kb.createdAt.toISOString(),
      updatedAt: kb.updatedAt.toISOString(),
      documents,
    })
  }),
)

// PATCH /api/v1/knowledge-bases/[id]
export const PATCH = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const id = param(ctx, 'id')
  const kb = await prisma.knowledgeBase.findUnique({ where: { id } })

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
  }

  if (!canManageKb(kb, ctx.user)) {
    return NextResponse.json({ error: 'No permission to edit this KB' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = updateKbSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const updated = await prisma.knowledgeBase.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json({ id: updated.id, name: updated.name })
})

// DELETE /api/v1/knowledge-bases/[id]
export const DELETE = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const id = param(ctx, 'id')
  const kb = await prisma.knowledgeBase.findUnique({ where: { id } })

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
  }

  if (!canManageKb(kb, ctx.user)) {
    return NextResponse.json({ error: 'No permission to delete this KB' }, { status: 403 })
  }

  // Clean up: vectors, files, then DB records
  try {
    await deleteVectors(id)
  } catch {
    // Non-fatal: vector cleanup failure shouldn't block deletion
  }

  try {
    await deleteKbDirectory(id)
  } catch {
    // Non-fatal
  }

  await prisma.knowledgeBase.delete({ where: { id } })

  return NextResponse.json({ status: 'deleted' })
})
