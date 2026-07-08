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

  it('runs artifact normalization before closing error and abort paths', () => {
    const errorHandler = source.slice(
      source.indexOf("} else if (state === 'error')"),
      source.indexOf("} else if (state === 'aborted')"),
    )
    const abortHandler = source.slice(
      source.indexOf("} else if (state === 'aborted')"),
      source.indexOf('  })', source.indexOf("} else if (state === 'aborted')")),
    )
    const piDisconnectHandler = source.slice(
      source.indexOf('client.onUnexpectedDisconnect = () => {'),
      source.indexOf('  // --- Auto-attach session images'),
    )

    expect(source).toContain('appendFallbackArtifactLiveMessages')
    expect(errorHandler).toContain('void saveSnapshotThenFinish()')
    expect(abortHandler).toContain('void saveSnapshotThenFinish()')
    expect(piDisconnectHandler).toContain('void saveSnapshotThenFinish()')
  })

  it('persists background chat.send startup failures before closing the stream', () => {
    const startupCatch = source.slice(
      source.indexOf('})().catch((err) => {'),
      source.indexOf('  return new Response(readable', source.indexOf('})().catch((err) => {')),
    )

    expect(startupCatch).toContain('terminalErrorMessage =')
    expect(startupCatch).toContain('void saveSnapshotThenFinish()')
    expect(startupCatch).not.toContain('cleanup()')
  })
})

describe('chat send runtime guardrails', () => {
  it('keeps runtime-specific sessions separated and routes pi to pi-wrapper', () => {
    expect(source).toContain('buildChatRuntimeSessionKey(runtime, agentId, user.id)')
    expect(source).toContain('runtime: dbRuntime, isActive: true')
    expect(source).toContain('targetSession.runtime === dbRuntime')
    expect(source).toContain("runtime === 'pi'")
    expect(source).toContain('resolvePiGatewayUrl')
    expect(source).toContain('buildPiChatSendParams')
    expect(source).toContain('onUnexpectedDisconnect')
    expect(source).toContain('Pi agent connection lost')
    expect(source).not.toContain('Pi runtime is not implemented yet')
  })
})
