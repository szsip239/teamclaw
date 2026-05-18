/**
 * Inline page-citation linker for KB QA answers.
 *
 * Scans assistant answer text for page-reference patterns (第N页 / [N] /
 * PN / Page N, plus ranges like 第5-9页 / P5-9) and rewrites them as
 * markdown links to a `kb-page:` sentinel URL. The chat renderer
 * intercepts those URLs to open the PDF preview drawer at the right
 * page.
 *
 * Ported behaviour mirrors llm-rag/static/app.js so the two systems
 * make the same things clickable.
 */

import type { ScoredNode } from '@/types/knowledge-base'

export const KB_PAGE_LINK_SCHEME = 'kb-page'

// Matches:
//   第 5 页 / 第5页 / 第 5-9 页 (CJK)
//   [5] / [5-9]
//   P5 / Page 5 / Pg. 5 / Page 5-9
const PAGE_REF_PATTERN =
  /第\s*(\d+)\s*(?:[–\-~至]\s*(\d+)\s*)?页|\[(\d+)(?:\s*[–\-~至]\s*(\d+))?\]|[Pp](?:age)?\.?\s*(\d+)(?:\s*[–\-~]\s*(\d+))?/g

interface PageRefMatch {
  raw: string
  start: number
  end: number
  startPage: number
  endPage: number | null
}

function parseMatches(text: string): PageRefMatch[] {
  const out: PageRefMatch[] = []
  let m: RegExpExecArray | null
  PAGE_REF_PATTERN.lastIndex = 0
  while ((m = PAGE_REF_PATTERN.exec(text))) {
    const startPage = Number(m[1] ?? m[3] ?? m[5])
    const endRaw = m[2] ?? m[4] ?? m[6]
    if (!startPage || Number.isNaN(startPage)) continue
    out.push({
      raw: m[0],
      start: m.index,
      end: m.index + m[0].length,
      startPage,
      endPage: endRaw ? Number(endRaw) : null,
    })
  }
  return out
}

/**
 * Pick the document a page citation most likely refers to.
 * - 0 sources: no doc → caller should skip linking
 * - 1 doc: that doc
 * - N docs: doc with most citations in answerSources
 */
export function resolveCitationDoc(
  answerSources: ScoredNode[] | undefined,
): string | null {
  if (!answerSources || answerSources.length === 0) return null
  const counts = new Map<string, number>()
  for (const source of answerSources) {
    const id = source.doc_id || ''
    if (!id) continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  if (counts.size === 0) return null
  let bestId: string | null = null
  let bestCount = -1
  for (const [id, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestId = id
    }
  }
  return bestId
}

/**
 * Rewrites page references in `content` into markdown links of the form
 * [original text](kb-page:<docId>:<page>). When `docId` is null (no
 * recognizable source), returns content unchanged.
 *
 * Avoids mangling URLs inside code spans by skipping content inside
 * ``` fences ``` and inline `code`.
 */
export function linkifyPageCitations(content: string, docId: string | null): string {
  if (!docId || !content) return content

  // Split content into segments, leaving code blocks/spans untouched.
  // Crude but adequate: ``` fenced blocks and `inline code`.
  const parts: { text: string; protect: boolean }[] = []
  let cursor = 0
  const fenceRe = /(```[\s\S]*?```|`[^`\n]+`)/g
  let fm: RegExpExecArray | null
  while ((fm = fenceRe.exec(content))) {
    if (fm.index > cursor) {
      parts.push({ text: content.slice(cursor, fm.index), protect: false })
    }
    parts.push({ text: fm[0], protect: true })
    cursor = fm.index + fm[0].length
  }
  if (cursor < content.length) {
    parts.push({ text: content.slice(cursor), protect: false })
  }

  const escapedDocId = encodeURIComponent(docId)
  return parts
    .map((part) => {
      if (part.protect) return part.text
      const matches = parseMatches(part.text)
      if (matches.length === 0) return part.text
      let out = ''
      let prev = 0
      for (const match of matches) {
        out += part.text.slice(prev, match.start)
        // Don't re-link inside an already-existing markdown link target.
        const before = part.text.slice(Math.max(0, match.start - 30), match.start)
        if (/\]\([^)]*$/.test(before)) {
          out += match.raw
        } else {
          const href = `${KB_PAGE_LINK_SCHEME}:${escapedDocId}:${match.startPage}`
          out += `[${match.raw}](${href})`
        }
        prev = match.end
      }
      out += part.text.slice(prev)
      return out
    })
    .join('')
}

/** Parse `kb-page:<docId>:<page>` URLs back into a { docId, page } pair. */
export function parsePageCitationHref(
  href: string,
): { docId: string; page: number } | null {
  if (!href.startsWith(`${KB_PAGE_LINK_SCHEME}:`)) return null
  const rest = href.slice(KB_PAGE_LINK_SCHEME.length + 1)
  const colonIdx = rest.lastIndexOf(':')
  if (colonIdx < 0) return null
  const docId = decodeURIComponent(rest.slice(0, colonIdx))
  const page = Number(rest.slice(colonIdx + 1))
  if (!docId || !Number.isFinite(page) || page < 1) return null
  return { docId, page }
}
