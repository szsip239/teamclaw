import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/chat/conversations/new/route.ts'), 'utf-8')

describe('new conversation runtime routing', () => {
  it('archives every active runtime session through runtime-aware gateway clients', () => {
    expect(source).toContain('findMany({')
    expect(source).toContain('for (const activeSession of activeSessions)')
    expect(source).toContain('fromDbChatRuntime(activeSession.runtime)')
    expect(source).toContain('getRuntimeGatewayClient')
    expect(source).toContain('markSessionInactive')
    expect(source).toContain('runtime: sessionRuntime')
    expect(source).toContain("triggerMemoryDump: sessionRuntime === 'openclaw'")
    expect(source).not.toContain('Pi runtime is not implemented yet')
  })
})
