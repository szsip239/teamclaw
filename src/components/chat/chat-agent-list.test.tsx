import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/chat/chat-agent-list.tsx'), 'utf-8')

describe('ChatAgentList', () => {
  it('exposes agent rename controls from the chat sidebar', () => {
    expect(source).toContain('chat.renameAgent')
    expect(source).toContain('/api/v1/agents/')
    expect(source).toContain('Pencil')
  })

  it('renders per-agent activity indicators', () => {
    expect(source).toContain('AgentStatusIndicator')
    expect(source).toContain('agentActivities')
    expect(source).toContain('chat.agentRunningStatus')
    expect(source).toContain('chat.agentUnreadStatus')
    expect(source).toContain('chat.agentErrorStatus')
  })
})
