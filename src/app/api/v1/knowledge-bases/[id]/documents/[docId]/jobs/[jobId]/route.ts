import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { getJobStatus } from '@/lib/knowledge-base/rag-client'

const PROCESSING_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

// GET /api/v1/knowledge-bases/[id]/documents/[docId]/jobs/[jobId]
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const kbId = param(ctx, 'id')
    const docId = param(ctx, 'docId')
    const jobId = param(ctx, 'jobId')

    const kb = await prisma.knowledgeBase.findUnique({ where: { id: kbId } })
    if (!kb || !isKbVisible(kb, ctx.user)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const doc = await prisma.knowledgeDocument.findFirst({
      where: { id: docId, knowledgeBaseId: kbId },
    })
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Query Python RAG service for job status
    const jobStatus = await getJobStatus(jobId)

    if (!jobStatus) {
      // Job not found in Python service — check for timeout
      if (
        doc.status === 'PROCESSING' &&
        Date.now() - doc.updatedAt.getTime() > PROCESSING_TIMEOUT_MS
      ) {
        // Auto-mark as FAILED due to timeout
        await prisma.knowledgeDocument.update({
          where: { id: docId },
          data: { status: 'FAILED', errorMessage: 'Processing timeout — job lost. Please retry.' },
        })
        return NextResponse.json({
          job_id: jobId,
          status: 'failed',
          progress: 0,
          logs: [],
          error: 'Processing timeout — job lost. Please retry.',
          page_count: null,
        })
      }

      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Sync status back to DB
    if (jobStatus.status === 'completed' && doc.status !== 'SUCCEEDED') {
      await prisma.knowledgeDocument.update({
        where: { id: docId },
        data: {
          status: 'SUCCEEDED',
          pageCount: jobStatus.page_count,
        },
      })
    } else if (jobStatus.status === 'failed' && doc.status !== 'FAILED') {
      await prisma.knowledgeDocument.update({
        where: { id: docId },
        data: {
          status: 'FAILED',
          errorMessage: jobStatus.error,
        },
      })
    }

    return NextResponse.json(jobStatus)
  }),
)
