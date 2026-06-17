import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/chat/conversations/new/route.ts'), 'utf-8')

describe('new conversation runtime routing', () => {
  it('archives pi sessions through runtime-aware gateway clients', () => {
    expect(source).toContain('getRuntimeGatewayClient')
    expect(source).toContain('markSessionInactive')
    expect(source).toContain('runtime,')
    expect(source).toContain("triggerMemoryDump: runtime === 'openclaw'")
    expect(source).not.toContain('Pi runtime is not implemented yet')
  })
})
