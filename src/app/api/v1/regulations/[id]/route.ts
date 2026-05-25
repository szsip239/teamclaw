import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import {
  withAuth,
  withPermission,
  withValidation,
  param,
  type AuthContext,
} from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { getDocumentIndexInfo } from '@/lib/knowledge-base/rag-client'
import { parseChapterSummary } from '@/lib/regulation/summarize'
import { serializePendingUpdate } from '@/lib/regulation/check'
import { updateTrackerSchema } from '@/lib/validations/regulation'
import type { RegulationTrackerDetail, RegulationTrackedDocument } from '@/types/regulation'

async function loadOwnedTracker(ctx: AuthContext) {
  const id = param(ctx, 'id')
  const tracker = await prisma.regulationTracker.findUnique({
    where: { id },
    include: { knowledgeBase: true },
  })
  if (!tracker || tracker.userId !== ctx.user.id) return null
  if (!isKbVisible(tracker.knowledgeBase, ctx.user)) return null
  return tracker
}

// GET /api/v1/regulations/[id] — detail with derived wiki summaries + pending
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const tracker = await loadOwnedTracker(ctx)
    if (!tracker) {
      return NextResponse.json({ error: '追踪记录不存在' }, { status: 404 })
    }

    const docs = await prisma.knowledgeDocument.findMany({
      where: { knowledgeBaseId: tracker.knowledgeBaseId },
      orderBy: { updatedAt: 'desc' },
    })

    const lastChecked = tracker.lastCheckedAt?.getTime() ?? null
    const tracked: RegulationTrackedDocument[] = await Promise.all(
      docs.map(async (doc) => {
        const info = await getDocumentIndexInfo(tracker.knowledgeBaseId, doc.docId).catch(() => null)
        const clauses = parseChapterSummary(info?.chapter_summary)
        return {
          id: doc.id,
          docId: doc.docId,
          fileName: doc.fileName,
          status: doc.status,
          summary: info?.summary ?? '',
          docType: info?.doc_type ?? '',
          keywords: info?.keywords ?? [],
          clauses,
          pageCount: doc.pageCount,
          updatedAt: doc.updatedAt.toISOString(),
          isNew: lastChecked !== null && doc.updatedAt.getTime() > lastChecked,
        }
      }),
    )

    const latest = docs.length
      ? new Date(Math.max(...docs.map((d) => d.updatedAt.getTime())))
      : null
    const newCount = lastChecked !== null
      ? docs.filter((d) => d.updatedAt.getTime() > lastChecked).length
      : docs.length

    const pending = await prisma.pendingUpdate.findMany({
      where: { trackerId: tracker.id },
      orderBy: [{ status: 'asc' }, { foundAt: 'desc' }],
    })
    const pendingNewCount = pending.filter((p) => p.status === 'NEW').length

    const detail: RegulationTrackerDetail = {
      id: tracker.id,
      name: tracker.name,
      knowledgeBaseId: tracker.knowledgeBaseId,
      knowledgeBaseName: tracker.knowledgeBase.name,
      knowledgeBaseDescription: tracker.knowledgeBase.description,
      knowledgeBaseScope: tracker.knowledgeBase.scope,
      knowledgeBaseCategory: tracker.knowledgeBase.category,
      documentCount: docs.length,
      newUpdateCount: newCount,
      pendingNewCount,
      keywords: tracker.keywords,
      notifyChannels: tracker.notifyChannels,
      searchCron: tracker.searchCron,
      lastCheckedAt: tracker.lastCheckedAt?.toISOString() ?? null,
      lastCheckRunAt: tracker.lastCheckRunAt?.toISOString() ?? null,
      latestDocumentAt: latest?.toISOString() ?? null,
      createdAt: tracker.createdAt.toISOString(),
      updatedAt: tracker.updatedAt.toISOString(),
      documents: tracked,
      pendingUpdates: pending.map(serializePendingUpdate),
    }

    return NextResponse.json(detail)
  }),
)

// PATCH /api/v1/regulations/[id] — edit name / keywords / notify / cron
export const PATCH = withAuth(
  withPermission(
    'knowledge:view',
    withValidation(updateTrackerSchema, async (_req, ctx) => {
      const id = param(ctx as unknown as AuthContext, 'id')
      const user = ctx.user!
      const tracker = await prisma.regulationTracker.findUnique({ where: { id } })
      if (!tracker || tracker.userId !== user.id) {
        return NextResponse.json({ error: '追踪记录不存在' }, { status: 404 })
      }

      const updated = await prisma.regulationTracker.update({
        where: { id },
        data: {
          ...(ctx.body.name !== undefined ? { name: ctx.body.name } : {}),
          ...(ctx.body.keywords !== undefined
            ? { keywords: Array.from(new Set(ctx.body.keywords.map((k: string) => k.trim()).filter(Boolean))) }
            : {}),
          ...(ctx.body.notifyChannels !== undefined ? { notifyChannels: ctx.body.notifyChannels } : {}),
          ...(ctx.body.searchCron !== undefined ? { searchCron: ctx.body.searchCron } : {}),
        },
      })
      return NextResponse.json({
        id: updated.id,
        name: updated.name,
        keywords: updated.keywords,
        notifyChannels: updated.notifyChannels,
        searchCron: updated.searchCron,
      })
    }),
  ),
)

// DELETE /api/v1/regulations/[id] — stop tracking
export const DELETE = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    const tracker = await prisma.regulationTracker.findUnique({ where: { id } })
    if (!tracker || tracker.userId !== ctx.user.id) {
      return NextResponse.json({ error: '追踪记录不存在' }, { status: 404 })
    }
    await prisma.regulationTracker.delete({ where: { id } })
    return NextResponse.json({ status: 'ok' })
  }),
)
