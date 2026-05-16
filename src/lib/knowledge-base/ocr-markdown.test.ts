import { describe, expect, it } from 'vitest'
import {
  normalizeOcrAssetSrc,
  sanitizeOcrHtmlTable,
  splitOcrMarkdownSegments,
} from './ocr-markdown'

describe('ocr markdown normalization', () => {
  it('rewrites OCR html images into markdown image URLs', () => {
    const segments = splitOcrMarkdownSegments(
      'ICS 77\n<div style="text-align: center;"><img src="imgs/a b.jpg" alt="cover" width="20%" /></div>',
      'kb-1',
      'doc-1',
    )

    expect(segments).toEqual([
      {
        type: 'markdown',
        content:
          'ICS 77\n\n![cover](/api/v1/knowledge-bases/kb-1/artifacts/kb-1/doc-1/imgs/a%20b.jpg)',
      },
    ])
  })

  it('rewrites markdown image URLs to the knowledge-base artifact proxy', () => {
    expect(normalizeOcrAssetSrc('images/plot.png', 'kb-1', 'doc-1')).toBe(
      '/api/v1/knowledge-bases/kb-1/artifacts/kb-1/doc-1/images/plot.png',
    )
  })

  it('sanitizes OCR html tables before rendering', () => {
    const html = sanitizeOcrHtmlTable(
      '<table onclick="bad()"><tr><td colspan="2" style="x">ok<script>alert(1)</script><img src="javascript:bad" onerror="bad()"><img src="imgs/a.png" alt="a" width="33%" /></td></tr></table>',
      'kb-1',
      'doc-1',
    )

    expect(html).toBe(
      '<table><tr><td colspan="2">ok<img src="/api/v1/knowledge-bases/kb-1/artifacts/kb-1/doc-1/imgs/a.png" alt="a" width="33%"></td></tr></table>',
    )
  })
})
