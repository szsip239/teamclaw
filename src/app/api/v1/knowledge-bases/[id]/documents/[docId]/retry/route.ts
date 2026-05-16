import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, param, type AuthContext } from '@/lib/middleware/auth'
import { canManageKb } from '@/lib/knowledge-base/permissions'
import { submitIngestionJob } from '@/lib/knowledge-base/rag-client'
import { existsSync } from 'fs'
import { join } from 'path'

function resolveFilePath(kbId: string, fileName: string): string {
  const base = process.env.NODE_ENV === 'production'
    ? '/app/data/knowledge-bases'
    : join(process.cwd(), 'data', 'knowledge-bases')
  // Match the sanitization logic in saveUploadedFile (file-storage.ts)
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  return join(base, kbId, 'uploads', safe)
}

function toContainerPath(hostPath: string): string {
  if (process.env.NODE_ENV === 'production') return hostPath
  return hostPath.replace(
    join(process.cwd(), 'data', 'knowledge-bases'),
    '/app/data/knowledge-bases',
  )
}

// POST /api/v1/knowledge-bases/[id]/documents/[docId]/retry
export const POST = withAuth(async (_req: NextRequest, ctx: AuthContext) => {
  const kbId = param(ctx, 'id')
  const docId = param(ctx, 'docId')

  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: kbId },
    select: { id: true, scope: true, category: true, departmentId: true, createdById: true },
  })

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

  if (doc.status !== 'FAILED') {
    return NextResponse.json({ error: 'Document is not in failed state' }, { status: 400 })
  }

  const hostPath = resolveFilePath(kbId, doc.fileName)

  if (!existsSync(hostPath)) {
    return NextResponse.json(
      { error: 'Original file no longer exists. Please re-upload.' },
      { status: 400 },
    )
  }

  try {
    await prisma.knowledgeDocument.update({
      where: { id: docId },
      data: { status: 'PROCESSING', errorMessage: null },
    })

    const job = await submitIngestionJob({
      kbId,
      docId: doc.docId,
      filePath: toContainerPath(hostPath),
    })

    await prisma.knowledgeDocument.update({
      where: { id: docId },
      data: { jobId: job.job_id, status: 'PROCESSING' },
    })

    return NextResponse.json({
      id: doc.id,
      docId: doc.docId,
      jobId: job.job_id,
      status: 'processing',
    })
  } catch (err) {
    await prisma.knowledgeDocument.update({
      where: { id: docId },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
      },
    })

    return NextResponse.json({
      id: doc.id,
      error: (err as Error).message,
    }, { status: 502 })
  }
})
