import { prisma } from '@/lib/db'
import { getDocumentIndexInfo } from '@/lib/knowledge-base/rag-client'
import { getSearchProvider } from './search'
import type { CheckUpdatesResult, PendingUpdateItem } from '@/types/regulation'

/**
 * Aggregate keywords for a tracker: prefer the user-curated list, otherwise
 * fall back to RAG-extracted keywords across the KB's documents (dedup'd,
 * top 20 by frequency-of-appearance).
 */
async function resolveKeywords(trackerId: string, explicit: string[]): Promise<string[]> {
  if (explicit.length > 0) return explicit
  const tracker = await prisma.regulationTracker.findUnique({
    where: { id: trackerId },
    select: { knowledgeBaseId: true },
  })
  if (!tracker) return []
  const docs = await prisma.knowledgeDocument.findMany({
    where: { knowledgeBaseId: tracker.knowledgeBaseId, status: 'SUCCEEDED' },
    select: { docId: true },
  })
  const counts = new Map<string, number>()
  await Promise.all(
    docs.map(async (d) => {
      const info = await getDocumentIndexInfo(tracker.knowledgeBaseId, d.docId).catch(() => null)
      for (const kw of info?.keywords ?? []) {
        const t = kw.trim()
        if (!t) continue
        counts.set(t, (counts.get(t) ?? 0) + 1)
      }
    }),
  )
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([kw]) => kw)
}

function serialize(row: {
  id: string
  trackerId: string
  sourceUrl: string
  source: string
  title: string
  summary: string
  suggestion: string | null
  matchedKeywords: string[]
  status: string
  foundAt: Date
  reviewedAt: Date | null
}): PendingUpdateItem {
  return {
    id: row.id,
    trackerId: row.trackerId,
    sourceUrl: row.sourceUrl,
    source: row.source,
    title: row.title,
    summary: row.summary,
    suggestion: row.suggestion,
    matchedKeywords: row.matchedKeywords,
    status: row.status as PendingUpdateItem['status'],
    foundAt: row.foundAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }
}

/**
 * Run the check pipeline for one tracker:
 *   keywords → search → upsert PendingUpdate (dedup by sourceUrl)
 * Idempotent: re-running won't insert duplicates and won't reset already-
 * reviewed statuses. Returns this run's view (newCount + items inserted).
 */
export async function runCheckForTracker(trackerId: string): Promise<CheckUpdatesResult> {
  const tracker = await prisma.regulationTracker.findUnique({ where: { id: trackerId } })
  if (!tracker) throw new Error(`Tracker not found: ${trackerId}`)

  const keywordsUsed = await resolveKeywords(trackerId, tracker.keywords)
  const hits = keywordsUsed.length > 0 ? await getSearchProvider().search(keywordsUsed) : []

  const inserted: PendingUpdateItem[] = []
  for (const hit of hits) {
    const existing = await prisma.pendingUpdate.findUnique({
      where: { trackerId_sourceUrl: { trackerId, sourceUrl: hit.url } },
    })
    if (existing) continue
    const row = await prisma.pendingUpdate.create({
      data: {
        trackerId,
        sourceUrl: hit.url,
        title: hit.title,
        summary: hit.summary,
        suggestion: hit.suggestion ?? null,
        matchedKeywords: hit.matchedKeywords,
      },
    })
    inserted.push(serialize(row))
  }

  const totalNew = await prisma.pendingUpdate.count({
    where: { trackerId, status: 'NEW' },
  })

  await prisma.regulationTracker.update({
    where: { id: trackerId },
    data: { lastCheckRunAt: new Date() },
  })

  return {
    trackerId,
    trackerName: tracker.name,
    keywordsUsed,
    searchedAt: new Date().toISOString(),
    newCount: inserted.length,
    totalNew,
    items: inserted,
  }
}

/** Run checks for every tracker owned by a user. */
export async function runCheckForUser(userId: string): Promise<CheckUpdatesResult[]> {
  const trackers = await prisma.regulationTracker.findMany({
    where: { userId },
    select: { id: true },
  })
  const results: CheckUpdatesResult[] = []
  for (const t of trackers) {
    results.push(await runCheckForTracker(t.id))
  }
  return results
}

export { serialize as serializePendingUpdate }
