import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, param, type AuthContext } from '@/lib/middleware/auth'
import { canManageKb } from '@/lib/knowledge-base/permissions'
import { saveUploadedFile, toContainerPath } from '@/lib/knowledge-base/file-storage'
import { submitIngestionJob } from '@/lib/knowledge-base/rag-client'

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// POST /api/v1/knowledge-bases/[id]/documents/upload
export const POST = withAuth(async (req: NextRequest, ctx: AuthContext) => {
  const kbId = param(ctx, 'id')
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })

  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
  }

  if (!canManageKb(kb, ctx.user)) {
    return NextResponse.json({ error: 'No permission to upload to this KB' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 400 })
  }

  // Validate filename
  const fileName = file.name
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  // Only accept PDF
  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const filePath = await saveUploadedFile(kbId, fileName, buffer)

  // Create document record
  const doc = await prisma.knowledgeDocument.create({
    data: {
      knowledgeBaseId: kbId,
      fileName,
      fileSize: file.size,
      status: 'PENDING',
    },
  })

  // Submit to RAG service for ingestion
  try {
    const job = await submitIngestionJob({
      kbId,
      docId: doc.docId,
      filePath: toContainerPath(filePath),
    })

    // Update document with job ID and status
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { jobId: job.job_id, status: 'PROCESSING' },
    })

    // Increment document count
    await prisma.knowledgeBase.update({
      where: { id: kbId },
      data: { documentCount: { increment: 1 } },
    })

    return NextResponse.json({
      id: doc.id,
      docId: doc.docId,
      jobId: job.job_id,
    }, { status: 201 })
  } catch (err) {
    // Mark as failed if RAG service is unreachable
    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: {
        status: 'FAILED',
        errorMessage: (err as Error).message,
      },
    })

    return NextResponse.json({
      id: doc.id,
      docId: doc.docId,
      error: (err as Error).message,
    }, { status: 502 })
  }
})
