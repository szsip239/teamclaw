import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { getJobStatus } from '@/lib/knowledge-base/rag-client'

const JOB_LOST_ERROR = 'Processing job was lost, likely because the RAG service restarted. Please retry.'

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
      if (doc.status === 'PROCESSING' || doc.status === 'PENDING') {
        await prisma.knowledgeDocument.update({
          where: { id: docId },
          data: { status: 'FAILED', errorMessage: JOB_LOST_ERROR },
        })
      }

      return NextResponse.json({
        job_id: jobId,
        status: doc.status === 'SUCCEEDED' ? 'completed' : 'failed',
        progress: doc.status === 'SUCCEEDED' ? 100 : 0,
        logs: [],
        error: doc.status === 'SUCCEEDED' ? null : (doc.errorMessage || JOB_LOST_ERROR),
        page_count: doc.pageCount,
      })
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
