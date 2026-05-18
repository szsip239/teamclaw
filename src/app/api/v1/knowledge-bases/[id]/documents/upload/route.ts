import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, param, type AuthContext } from '@/lib/middleware/auth'
import { canManageKb } from '@/lib/knowledge-base/permissions'
import { saveUploadedFile, toContainerPath } from '@/lib/knowledge-base/file-storage'
import { submitIngestionJob } from '@/lib/knowledge-base/rag-client'
import {
  parseMultipartFile,
  validatePdfUpload,
  type ParsedUploadFile,
} from '@/lib/knowledge-base/upload-parser'

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

  let file: ParsedUploadFile
  try {
    const contentType = req.headers.get('content-type') || ''
    const boundary = contentType.includes('boundary=')
      ? contentType.split('boundary=')[1]?.split(';')[0]?.trim()
      : ''
    if (!boundary) {
      return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
    }

    if (!req.body) {
      return NextResponse.json({ error: 'No request body provided' }, { status: 400 })
    }

    const raw = await readFullStream(req.body!)
    file = parseMultipartFile(Buffer.from(raw), boundary)
  } catch (err) {
    console.error('[upload] body parse failed', err)
    const error = err instanceof Error ? err.message : 'Failed to read uploaded file'
    return NextResponse.json({ error }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.buffer.byteLength > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 400 })
  }

  const fileName = file.fileName
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
  }

  if (!fileName.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }

  const buffer = file.buffer
  const pdfValidation = validatePdfUpload(buffer)
  if (!pdfValidation.ok) {
    return NextResponse.json({ error: pdfValidation.error }, { status: 400 })
  }

  const fileSize = buffer.byteLength
  const filePath = await saveUploadedFile(kbId, fileName, buffer)

  // Create document record
  const doc = await prisma.knowledgeDocument.create({
    data: {
      knowledgeBaseId: kbId,
      fileName,
      fileSize,
      status: 'PENDING',
    },
  })

  // Submit to RAG service for ingestion
  try {
    const job = await submitIngestionJob({
      kbId,
      docId: doc.docId,
      filePath: toContainerPath(filePath),
      fileName,
      displayName: fileName,
    })

    await prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { jobId: job.job_id, status: 'PROCESSING' },
    })

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

// ── helpers ──────────────────────────────────────────────────────────────

async function readFullStream(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.byteLength
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}
