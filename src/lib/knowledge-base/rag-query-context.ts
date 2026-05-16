import { prisma } from '@/lib/db'
import type { KbCategory } from '@/types/knowledge-base'
import type { KbSourceRef } from '@/types/chat'

// Inline non-streaming RAG query — calls Python RAG service /api/query
async function querySingleKb(
  kbId: string,
  question: string,
  topK = 5,
): Promise<{ sources: { text: string; score: number }[] } | null> {
  try {
    const { buildRagCredentialHeaders } = await import('./credentials')
    const credHeaders = await buildRagCredentialHeaders()

    const res = await fetch(
      `${process.env.RAG_SERVICE_URL || 'http://rag:8000'}/api/query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-service-secret': process.env.RAG_SERVICE_SECRET || '',
          ...credHeaders,
        },
        body: JSON.stringify({
          kb_id: kbId,
          question,
          generate_answer: false,
          top_k: topK,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!res.ok) return null
    const data = await res.json()
    return {
      sources: (data.sources ?? []).map((s: Record<string, unknown>) => ({
        text: String(s.text ?? ''),
        score: Number(s.score ?? 0),
      })),
    }
  } catch {
    return null
  }
}

const MAX_CONTEXT_CHARS = 8_000

interface QueryResult {
  kbId: string
  kbName: string
  category: KbCategory
  chunks: { text: string; score: number }[]
}

/**
 * Query multiple KBs and format retrieved chunks into a context prefix.
 * RULES KBs are always auto-included. INTERNAL/EXTERNAL must be explicitly
 * passed via mountedKbIds.
 */
export async function queryKBsForContext(
  mountedKbIds: string[],
  question: string,
): Promise<{ context: string; sources: KbSourceRef[] }> {
  // 1. Fetch all RULES KBs (auto-mounted, always active)
  const rulesKbs = await prisma.knowledgeBase.findMany({
    where: { category: 'RULES' },
    select: { id: true, name: true, category: true },
  })

  // 2. Fetch mounted KBs (INTERNAL/EXTERNAL only — RULES are auto-handled).
  // Exclude any RULES KBs that might appear in mountedKbIds (dedup handled by Set in loop).
  const mountedKbs =
    mountedKbIds.length > 0
      ? await prisma.knowledgeBase.findMany({
          where: { id: { in: mountedKbIds }, category: { not: 'RULES' } },
          select: { id: true, name: true, category: true },
        })
      : []

  // 3. Build unique query list (RULES first, then mounted)
  const queriedSet = new Set<string>()
  const queries: QueryResult[] = []

  for (const kb of rulesKbs) {
    if (!queriedSet.has(kb.id)) {
      queriedSet.add(kb.id)
      queries.push({ kbId: kb.id, kbName: kb.name, category: kb.category as KbCategory, chunks: [] })
    }
  }
  for (const kb of mountedKbs) {
    if (!queriedSet.has(kb.id)) {
      queriedSet.add(kb.id)
      queries.push({ kbId: kb.id, kbName: kb.name, category: kb.category as KbCategory, chunks: [] })
    }
  }

  if (queries.length === 0) return { context: '', sources: [] }

  // 4. Query each KB in parallel
  const results = await Promise.all(
    queries.map(async (q) => {
      const result = await querySingleKb(q.kbId, question)
      if (result) q.chunks = result.sources
      return q
    }),
  )

  // 5. Build sources for SSE emission
  const allSources: KbSourceRef[] = []
  for (const r of results) {
    for (const c of r.chunks) {
      allSources.push({
        kbId: r.kbId,
        kbName: r.kbName,
        category: r.category,
        text: c.text.slice(0, 300),
        score: c.score,
      })
    }
  }

  // 6. Format context by category priority: RULES > INTERNAL > EXTERNAL
  const categoryOrder: KbCategory[] = ['RULES', 'INTERNAL', 'EXTERNAL']
  const byCategory: Record<string, QueryResult[]> = { RULES: [], INTERNAL: [], EXTERNAL: [] }
  for (const r of results) {
    if (r.chunks.length > 0) byCategory[r.category].push(r)
  }

  const categoryLabels: Record<string, string> = {
    RULES: 'System Rules — always applied',
    INTERNAL: 'Internal Knowledge',
    EXTERNAL: 'External References',
  }

  let context = ''
  for (const cat of categoryOrder) {
    const kbs = byCategory[cat]
    if (kbs.length === 0) continue

    context += `\n[${categoryLabels[cat]}]\n`
    for (const kb of kbs) {
      context += `Source: ${kb.kbName}\n`
      for (const c of kb.chunks) {
        context += `- ${c.text}\n`
      }
    }
  }

  // 7. Cap total context at MAX_CONTEXT_CHARS.
  // Drop lowest-score chunks from EXTERNAL first, then INTERNAL, RULES last.
  if (context.length > MAX_CONTEXT_CHARS) {
    // Rebuild with truncation: iterate category order (RULES first), add until cap reached
    let capped = ''
    for (const cat of categoryOrder) {
      const kbs = byCategory[cat]
      if (kbs.length === 0) continue
      if (capped.length >= MAX_CONTEXT_CHARS) break

      let section = `\n[${categoryLabels[cat]}]\n`
      for (const kb of kbs) {
        let kbSection = `Source: ${kb.kbName}\n`
        for (const c of kb.chunks) {
          const line = `- ${c.text}\n`
          if ((capped + section + kbSection + line).length <= MAX_CONTEXT_CHARS) {
            kbSection += line
          }
        }
        if (kbSection !== `Source: ${kb.kbName}\n`) {
          section += kbSection
        }
      }
      if (section !== `\n[${categoryLabels[cat]}]\n`) {
        capped += section
      }
    }
    context = capped.trimStart()
  }

  // 8. Build final context with user question
  const finalContext = context
    ? `${context.trim()}\n\n[User Question]\n${question}`
    : ''

  return { context: finalContext, sources: allSources }
}
