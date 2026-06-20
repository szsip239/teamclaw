import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  path.resolve('src/app/api/v1/chat/sessions/[id]/history/route.ts'),
  'utf-8',
)

describe('chat history runtime routing', () => {
  it('uses each grouped session runtime to fetch current history', () => {
    expect(source).toContain('conversationGroupId')
    expect(source).toContain('for (const runtimeSession of groupSessions)')
    expect(source).toContain('fromDbChatRuntime(runtimeSession.runtime)')
    expect(source).toContain('buildChatRuntimeSessionKey(')
    expect(source).toContain('runtimeSession.agentId')
    expect(source).toContain('getRuntimeGatewayClient(runtimeSession.instanceId, runtime)')
    expect(source).toContain('sourceSessionId')
    expect(source).not.toContain('`agent:${session.agentId}:tc:${session.userId}`')
  })

  it('trims snapshot/current overlap through the shared semantic helper', () => {
    expect(source).toContain('trimCurrentMessagesOverlappingSnapshot(snapshots, currentMessages)')
    expect(source).not.toContain('lastBatch[i].content === currentMessages[i].content')
  })
})
