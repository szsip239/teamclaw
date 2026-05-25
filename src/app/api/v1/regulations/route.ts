import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, withValidation, type AuthContext } from '@/lib/middleware/auth'
import { isKbVisible } from '@/lib/knowledge-base/permissions'
import { getDocumentIndexInfo } from '@/lib/knowledge-base/rag-client'
import { createTrackerSchema } from '@/lib/validations/regulation'
import type { RegulationTrackerOverview } from '@/types/regulation'

// GET /api/v1/regulations — list current user's trackers
export const GET = withAuth(
  withPermission('knowledge:view', async (_req: NextRequest, ctx: AuthContext) => {
    const trackers = await prisma.regulationTracker.findMany({
      where: { userId: ctx.user.id },
      include: { knowledgeBase: true },
      orderBy: { createdAt: 'desc' },
    })

    // Strip trackers whose KB the user can no longer see (rare — e.g. moved
    // out of dept), and compute newUpdateCount + latestDocumentAt cheaply by
    // querying KnowledgeDocument.updatedAt in bulk.
    const visible = trackers.filter((t) => isKbVisible(t.knowledgeBase, ctx.user))
    const kbIds = visible.map((t) => t.knowledgeBaseId)
    const trackerIds = visible.map((t) => t.id)

    const docs = kbIds.length
      ? await prisma.knowledgeDocument.findMany({
          where: { knowledgeBaseId: { in: kbIds } },
          select: { knowledgeBaseId: true, updatedAt: true },
        })
      : []

    const byKb = new Map<string, Date[]>()
    for (const d of docs) {
      const arr = byKb.get(d.knowledgeBaseId) ?? []
      arr.push(d.updatedAt)
      byKb.set(d.knowledgeBaseId, arr)
    }

    const pendingCounts = trackerIds.length
      ? await prisma.pendingUpdate.groupBy({
          by: ['trackerId'],
          where: { trackerId: { in: trackerIds }, status: 'NEW' },
          _count: { _all: true },
        })
      : []
    const pendingByTracker = new Map<string, number>()
    for (const row of pendingCounts) pendingByTracker.set(row.trackerId, row._count._all)

    const items: RegulationTrackerOverview[] = visible.map((t) => {
      const dates = byKb.get(t.knowledgeBaseId) ?? []
      const latest = dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null
      const newCount = t.lastCheckedAt
        ? dates.filter((d) => d.getTime() > t.lastCheckedAt!.getTime()).length
        : dates.length
      return {
        id: t.id,
        name: t.name,
        knowledgeBaseId: t.knowledgeBaseId,
        knowledgeBaseName: t.knowledgeBase.name,
        knowledgeBaseDescription: t.knowledgeBase.description,
        knowledgeBaseScope: t.knowledgeBase.scope,
        knowledgeBaseCategory: t.knowledgeBase.category,
        documentCount: t.knowledgeBase.documentCount,
        newUpdateCount: newCount,
        pendingNewCount: pendingByTracker.get(t.id) ?? 0,
        keywords: t.keywords,
        notifyChannels: t.notifyChannels,
        searchCron: t.searchCron,
        lastCheckedAt: t.lastCheckedAt?.toISOString() ?? null,
        lastCheckRunAt: t.lastCheckRunAt?.toISOString() ?? null,
        latestDocumentAt: latest?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
      }
    })

    return NextResponse.json({ trackers: items })
  }),
)

// POST /api/v1/regulations — create a tracker bound to a KB
export const POST = withAuth(
  withPermission(
    'knowledge:view',
    withValidation(createTrackerSchema, async (_req, ctx) => {
      const user = ctx.user!
      const { knowledgeBaseId, name } = ctx.body
      const kb = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } })
      if (!kb) {
        return NextResponse.json({ error: '知识库不存在' }, { status: 404 })
      }
      if (!isKbVisible(kb, user)) {
        return NextResponse.json({ error: '没有权限访问该知识库' }, { status: 403 })
      }

      const existing = await prisma.regulationTracker.findUnique({
        where: { userId_knowledgeBaseId: { userId: user.id, knowledgeBaseId } },
      })
      if (existing) {
        return NextResponse.json({ error: '该知识库已在追踪列表中', id: existing.id }, { status: 409 })
      }

      // Seed keywords from RAG indexInfo so the search pipeline can run on
      // day one without the user having to manually curate them. We dedup
      // and cap at 20 to avoid noisy results.
      const seedDocs = await prisma.knowledgeDocument.findMany({
        where: { knowledgeBaseId, status: 'SUCCEEDED' },
        select: { docId: true },
      })
      const seedCounts = new Map<string, number>()
      await Promise.all(
        seedDocs.slice(0, 30).map(async (d) => {
          const info = await getDocumentIndexInfo(knowledgeBaseId, d.docId).catch(() => null)
          for (const kw of info?.keywords ?? []) {
            const t = kw.trim()
            if (!t) continue
            seedCounts.set(t, (seedCounts.get(t) ?? 0) + 1)
          }
        }),
      )
      const seededKeywords = Array.from(seedCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([kw]) => kw)

      const tracker = await prisma.regulationTracker.create({
        data: {
          knowledgeBaseId,
          userId: user.id,
          name: name?.trim() || kb.name,
          keywords: seededKeywords,
        },
      })
      return NextResponse.json(
        { id: tracker.id, name: tracker.name, keywords: tracker.keywords },
        { status: 201 },
      )
    }),
  ),
)
