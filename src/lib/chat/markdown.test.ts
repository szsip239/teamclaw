import { describe, expect, it } from 'vitest'
import { normalizeChatMarkdown } from './markdown'

describe('normalizeChatMarkdown', () => {
  it('normalizes split echarts fences into markdown language fences', () => {
    expect(
      normalizeChatMarkdown('```\necharts\n{ "series": [] }\n```'),
    ).toBe('```echarts\n{ "series": [] }\n```')
  })

  it('normalizes split mermaid fences without changing ordinary code blocks', () => {
    expect(
      normalizeChatMarkdown('```\nmermaid\ngraph TD; A-->B;\n```\n\n```\nplain\n```'),
    ).toBe('```mermaid\ngraph TD; A-->B;\n```\n\n```\nplain\n```')
  })
})
