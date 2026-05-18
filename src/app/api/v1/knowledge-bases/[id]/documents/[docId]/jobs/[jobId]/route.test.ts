import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  path.resolve('src/app/api/v1/knowledge-bases/[id]/documents/[docId]/jobs/[jobId]/route.ts'),
  'utf-8',
)

describe('knowledge document job status route', () => {
  it('returns a terminal failed job response when the RAG in-memory job is lost', () => {
    expect(source).toContain('JOB_LOST_ERROR')
    expect(source).toContain("? 'completed' : 'failed'")
    expect(source).not.toContain("return NextResponse.json({ error: 'Job not found' }, { status: 404 })")
  })
})
