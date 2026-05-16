import { describe, expect, it } from 'vitest'
import { stripRagContextForDisplay } from './rag-user-message'

describe('stripRagContextForDisplay', () => {
  it('keeps only the original question from an injected RAG prompt', () => {
    const text = `[Internal Knowledge]
Source: 钢丝绳知识
- 本标准规定了电绝缘鞋的分类、式样、技术要求。

[User Question]
GB+12011-2009足部防护+电绝缘鞋.pdf讲了什么？`

    expect(stripRagContextForDisplay(text)).toBe(
      'GB+12011-2009足部防护+电绝缘鞋.pdf讲了什么？',
    )
  })

  it('does not strip an ordinary message that mentions User Question literally', () => {
    const text = '请解释 Markdown 里的 [User Question] 这个标签'

    expect(stripRagContextForDisplay(text)).toBe(text)
  })
})
