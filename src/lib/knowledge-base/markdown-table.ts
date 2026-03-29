/**
 * Parse markdown pipe tables into HTML <table>.
 * Ported from reference project's web_helpers + frontend markdownTableToHtml().
 */

const ALIGN_ROW_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function splitRow(line: string): string[] {
  const stripped = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return stripped.split('|').map((cell) => cell.trim())
}

/**
 * Rewrite relative image paths inside markdown/HTML to artifact proxy URLs.
 * `images/xxx.png` → `/api/v1/knowledge-bases/{kbId}/artifacts/{docId}/images/xxx.png`
 */
function normalizeAssetSrc(src: string, kbId: string, docId: string): string {
  const value = (src || '').trim()
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) return value
  if (value.startsWith('images/') && docId && kbId) {
    return `/api/v1/knowledge-bases/${kbId}/artifacts/${docId}/${value}`
  }
  return value
}

function renderCell(cell: string, kbId: string, docId: string): string {
  let text = (cell ?? '').replace(/<br\s*\/?>/gi, '\n')

  // Rewrite markdown image refs: ![alt](images/xxx.png)
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, src: string) => {
    const normalizedSrc = normalizeAssetSrc(src, kbId, docId)
    return `<img class="inline max-h-16" src="${escapeHtml(normalizedSrc)}" alt="${escapeHtml(alt || 'image')}" />`
  })

  // Escape remaining HTML but preserve our img tags
  const imgPlaceholders: string[] = []
  text = text.replace(/<img [^>]+>/g, (match) => {
    imgPlaceholders.push(match)
    return `__IMG_${imgPlaceholders.length - 1}__`
  })

  text = escapeHtml(text).replace(/\n/g, '<br>')

  imgPlaceholders.forEach((img, i) => {
    text = text.replace(`__IMG_${i}__`, img)
  })

  return text
}

export function markdownTableToHtml(markdown: string, kbId = '', docId = ''): string {
  const lines = markdown.trim().split('\n').filter((l) => l.trim())
  if (lines.length < 2) return `<pre>${escapeHtml(markdown)}</pre>`

  // Check if line 2 is the alignment row (---|---|---)
  const hasAlignRow = ALIGN_ROW_RE.test(lines[1])
  if (!hasAlignRow) return `<pre>${escapeHtml(markdown)}</pre>`

  const headerCells = splitRow(lines[0])
  const bodyRows = lines.slice(2) // skip header + align row

  const headHtml = headerCells
    .map((cell) => `<th>${renderCell(cell, kbId, docId)}</th>`)
    .join('')

  const bodyHtml = bodyRows
    .filter((line) => line.includes('|'))
    .map((line) => {
      const cells = splitRow(line)
      return '<tr>' + cells.map((cell) => `<td>${renderCell(cell, kbId, docId)}</td>`).join('') + '</tr>'
    })
    .join('')

  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}

/**
 * Normalize HTML tables: rewrite img src paths to artifact proxy URLs.
 */
export function normalizeHtmlTable(rawHtml: string, kbId: string, docId: string): string {
  if (!rawHtml) return ''
  // Rewrite img src attributes
  return rawHtml.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (_match, prefix: string, src: string, suffix: string) => {
      return prefix + normalizeAssetSrc(src, kbId, docId) + suffix
    },
  )
}
