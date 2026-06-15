import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/app/api/v1/chat/send/route.ts'), 'utf-8')

describe('chat send post-run cleanup', () => {
  it('continues handling terminal gateway events after the SSE client disconnects', () => {
    const chatHandler = source.slice(
      source.indexOf("const unsubChat = client.on('chat'"),
      source.indexOf('// Fallback timer:'),
    )
    const agentHandler = source.slice(
      source.indexOf("const unsubAgent = client.on('agent'"),
      source.indexOf('  async function cleanup()'),
    )

    expect(chatHandler).not.toContain('if (closed) return')
    expect(agentHandler).not.toContain('if (closed) return')
    expect(source).toContain('let finishStarted = false')
    expect(source).toContain('if (finishStarted) return')
  })
})
