export type OcrMarkdownSegment =
  | { type: 'markdown'; content: string }
  | { type: 'html-table'; html: string }

const HTML_TABLE_RE = /<table\b[\s\S]*?<\/table>/gi
const HTML_IMG_RE = /<img\b[^>]*>/gi
const WRAPPER_TAG_RE = /<\/?(?:div|p|span|center)\b[^>]*>/gi
const LINE_BREAK_RE = /<br\s*\/?>/gi

const ALLOWED_TABLE_TAGS = new Set([
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'code',
  'sub',
  'sup',
  'img',
])

function escapeMarkdownImageAlt(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/]/g, '\\]')
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function readHtmlAttr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
}

function normalizeRelativePath(value: string): string {
  return value.trim().replace(/^\.\/+/, '')
}

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function normalizeOcrAssetSrc(src: string, kbId: string, docId: string): string {
  const value = normalizeRelativePath(src)
  if (!value || value.includes('..')) return ''

  if (/^(?:https?:)?\/\//i.test(value) || value.startsWith('data:image/')) {
    return value
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return ''

  if (value.startsWith('/api/v1/')) return value

  if (value.startsWith('/artifacts/')) {
    return `/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/artifacts/${value
      .replace(/^\/artifacts\//, '')
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`
  }

  if (value.startsWith('/')) return value
  if (!kbId || !docId) return value

  return `/api/v1/knowledge-bases/${encodeURIComponent(kbId)}/artifacts/${encodePath(kbId)}/${encodePath(docId)}/${encodePath(value)}`
}

function htmlImgToMarkdown(tag: string, kbId: string, docId: string): string {
  const src = normalizeOcrAssetSrc(readHtmlAttr(tag, 'src'), kbId, docId)
  const alt = readHtmlAttr(tag, 'alt') || 'image'
  if (!src) return alt
  return `\n\n![${escapeMarkdownImageAlt(alt)}](${src})\n\n`
}

function normalizeMarkdownImageUrls(markdown: string, kbId: string, docId: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt: string, src: string) => {
    const normalizedSrc = normalizeOcrAssetSrc(src.trim(), kbId, docId)
    if (!normalizedSrc) return alt
    return `![${escapeMarkdownImageAlt(alt)}](${normalizedSrc})`
  })
}

function normalizeMarkdownText(markdown: string, kbId: string, docId: string): string {
  return normalizeMarkdownImageUrls(
    markdown
      .replace(LINE_BREAK_RE, '\n')
      .replace(HTML_IMG_RE, (tag) => htmlImgToMarkdown(tag, kbId, docId))
      .replace(WRAPPER_TAG_RE, '\n')
      .replace(/\n{3,}/g, '\n\n'),
    kbId,
    docId,
  ).trim()
}

function safeIntegerAttr(attrs: string, name: string): string {
  const value = readHtmlAttr(attrs, name)
  if (!/^\d{1,2}$/.test(value)) return ''
  return ` ${name}="${value}"`
}

function safeDimensionAttr(attrs: string, name: string): string {
  const value = readHtmlAttr(attrs, name)
  if (!/^\d{1,4}%?$/.test(value)) return ''
  return ` ${name}="${escapeHtmlAttr(value)}"`
}

export function sanitizeOcrHtmlTable(html: string, kbId: string, docId: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?([a-z][\w:-]*)\b([^>]*)>/gi, (match, rawTag: string, attrs: string) => {
      const tag = rawTag.toLowerCase()
      if (!ALLOWED_TABLE_TAGS.has(tag)) return ''

      if (match.startsWith('</')) return `</${tag}>`
      if (tag === 'br') return '<br>'

      if (tag === 'td' || tag === 'th') {
        return `<${tag}${safeIntegerAttr(attrs, 'colspan')}${safeIntegerAttr(attrs, 'rowspan')}>`
      }

      if (tag === 'img') {
        const src = normalizeOcrAssetSrc(readHtmlAttr(attrs, 'src'), kbId, docId)
        if (!src) return ''
        const alt = readHtmlAttr(attrs, 'alt') || 'image'
        return `<img src="${escapeHtmlAttr(src)}" alt="${escapeHtmlAttr(alt)}"${safeDimensionAttr(attrs, 'width')}${safeDimensionAttr(attrs, 'height')}>`
      }

      return `<${tag}>`
    })
}

export function splitOcrMarkdownSegments(markdown: string, kbId: string, docId: string): OcrMarkdownSegment[] {
  const segments: OcrMarkdownSegment[] = []
  let lastIndex = 0

  for (const match of markdown.matchAll(HTML_TABLE_RE)) {
    const tableHtml = match[0]
    const index = match.index ?? 0
    const before = normalizeMarkdownText(markdown.slice(lastIndex, index), kbId, docId)

    if (before) segments.push({ type: 'markdown', content: before })
    segments.push({ type: 'html-table', html: sanitizeOcrHtmlTable(tableHtml, kbId, docId) })

    lastIndex = index + tableHtml.length
  }

  const after = normalizeMarkdownText(markdown.slice(lastIndex), kbId, docId)
  if (after) segments.push({ type: 'markdown', content: after })

  return segments
}
