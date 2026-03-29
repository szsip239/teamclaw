import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, param, type AuthContext } from '@/lib/middleware/auth'
import { canManageKb } from '@/lib/knowledge-base/permissions'
import { deleteVectors } from '@/lib/knowledge-base/rag-client'
import { deleteDocumentFiles } from '@/lib/knowledge-base/file-storage'

// DELETE /api/v1/knowledge-bases/[id]/documents/[docId]
export const DELETE = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const kbId = param(ctx, 'id')
  const docId = param(ctx, 'docId')

  const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
  }

  if (!canManageKb(kb, ctx.user)) {
    return NextResponse.json({ error: 'No permission' }, { status: 403 })
  }

  const doc = await prisma.knowledgeDocument.findFirst({
    where: { id: docId, knowledgeBaseId: kbId },
  })

  if (!doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  // Clean up vectors and files
  try {
    await deleteVectors(kbId, doc.docId)
  } catch {
    // Non-fatal
  }

  try {
    await deleteDocumentFiles(kbId, doc.docId)
  } catch {
    // Non-fatal
  }

  await prisma.knowledgeDocument.delete({ where: { id: docId } })

  // Decrement document count
  await prisma.knowledgeBase.update({
    where: { id: kbId },
    data: { documentCount: { decrement: 1 } },
  })

  return NextResponse.json({ status: 'deleted' })
})
