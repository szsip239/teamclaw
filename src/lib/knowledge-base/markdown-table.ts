/**
 * Parse markdown pipe tables into HTML <table>.
 * Ported from reference project's web_helpers._render_markdown_table_block().
 */

const ALIGN_ROW_RE = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function splitRow(line: string): string[] {
  const stripped = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return stripped.split('|').map((cell) => cell.trim())
}

export function markdownTableToHtml(markdown: string): string {
  const lines = markdown.trim().split('\n').filter((l) => l.trim())
  if (lines.length < 2) return `<pre>${escapeHtml(markdown)}</pre>`

  // Check if line 2 is the alignment row (---|---|---)
  const hasAlignRow = ALIGN_ROW_RE.test(lines[1])
  if (!hasAlignRow) return `<pre>${escapeHtml(markdown)}</pre>`

  const headerCells = splitRow(lines[0])
  const bodyRows = lines.slice(2) // skip header + align row

  const headHtml = headerCells
    .map((cell) => `<th>${escapeHtml(cell)}</th>`)
    .join('')

  const bodyHtml = bodyRows
    .filter((line) => line.includes('|'))
    .map((line) => {
      const cells = splitRow(line)
      return '<tr>' + cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('') + '</tr>'
    })
    .join('')

  return `<table><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`
}
