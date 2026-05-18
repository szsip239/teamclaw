import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const qaSource = readFileSync(path.resolve('src/components/knowledge-bases/kb-qa-tab.tsx'), 'utf-8')

const streamSource = readFileSync(path.resolve('src/lib/knowledge-base/query-stream.ts'), 'utf-8')

const ragQuerySource = readFileSync(path.resolve('rag-service/app/query.py'), 'utf-8')

describe('KbQaTab llm-rag-style Q&A migration', () => {
  it('passes the thinking toggle through to the streaming backend', () => {
    expect(qaSource).toMatch(
      /streamKbQuery\(\s*kbId,\s*q,\s*true,\s*8,\s*showThinking,\s*controller\.signal,?\s*\)/,
    )
    expect(streamSource).toContain('enableThinking: boolean = true')
    expect(streamSource).toContain(
      'JSON.stringify({ question, generateAnswer, topK, enableThinking })',
    )
  })

  it('renders process, reasoning, sources, assets, and source-page preview hooks', () => {
    expect(qaSource).toMatch(/event\.type === ['"]progress['"]/)
    expect(qaSource).toMatch(/event\.type === ['"]reasoning['"]/)
    expect(qaSource).toContain('KbAnswerAssets')
    expect(qaSource).toContain('KbQaSources')
    expect(qaSource).toContain('KbDocumentOriginalSheet')
    expect(qaSource).toContain('onSourceOpen={openSource}')
  })

  it('streams llm-rag-style progress and reasoning events from the RAG service', () => {
    expect(ragQuerySource).toContain('_sse("progress"')
    expect(ragQuerySource).toContain('_sse("reasoning"')
    expect(ragQuerySource).toContain('enable_thinking=req.enable_thinking')
  })
})
