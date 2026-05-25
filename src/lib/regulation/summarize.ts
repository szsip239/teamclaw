import type { RegulationClause } from '@/types/regulation'

/**
 * Parse a RAG `chapter_summary` block into individual wiki-style clauses.
 *
 * The RAG service emits chapter summaries as plain text with one chapter per
 * line or block, typically in shapes like:
 *   "第一章 总则: ...一段说明..."
 *   "1. 适用范围\n本规定适用于..."
 *   "## 第三条 罚则\n违反本条..."
 *
 * We split on common chapter / clause markers and keep the heading + body as
 * `{title, content}` pairs. If no markers are found, the whole block is
 * returned as a single "全文摘要" entry so the UI is never empty.
 */
export function parseChapterSummary(raw: string | null | undefined): RegulationClause[] {
  if (!raw) return []
  const text = raw.replace(/\r\n/g, '\n').trim()
  if (!text) return []

  // Split on lines that look like a chapter / clause heading. We do a
  // forward-look split so the heading line stays with its body.
  const headingPattern =
    /^(?:#{1,6}\s+)?(?:第[一二三四五六七八九十百千零〇\d]+[章条节款项部分]|[一二三四五六七八九十]+、|\d+[\.\．、)]\s*|[（(]\s*[一二三四五六七八九十\d]+\s*[)）]\s*)/

  const lines = text.split('\n')
  const blocks: string[] = []
  let current: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      if (current.length) current.push('')
      continue
    }
    if (headingPattern.test(trimmed) && current.length) {
      blocks.push(current.join('\n').trim())
      current = [trimmed]
    } else {
      current.push(trimmed)
    }
  }
  if (current.length) blocks.push(current.join('\n').trim())

  const clauses: RegulationClause[] = []
  blocks.forEach((block, idx) => {
    if (!block) return
    const firstNewline = block.indexOf('\n')
    let title: string
    let content: string
    if (firstNewline === -1) {
      // Single-line block — split on first ": " / "：" if present.
      const colonIdx = block.search(/[:：]/)
      if (colonIdx > 0 && colonIdx < 60) {
        title = block.slice(0, colonIdx).trim()
        content = block.slice(colonIdx + 1).trim()
      } else {
        title = `条目 ${idx + 1}`
        content = block
      }
    } else {
      title = block.slice(0, firstNewline).replace(/^#{1,6}\s+/, '').trim()
      content = block.slice(firstNewline + 1).trim()
    }
    if (!title) title = `条目 ${idx + 1}`
    if (!content) content = title
    clauses.push({ id: `clause-${idx}`, title, content })
  })

  if (clauses.length === 0) {
    clauses.push({ id: 'clause-0', title: '全文摘要', content: text })
  }
  return clauses
}
