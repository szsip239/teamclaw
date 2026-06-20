import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/chat/chat-agent-list.tsx'), 'utf-8')

describe('ChatAgentList', () => {
  it('opens agent rename from long press instead of a visible row button', () => {
    expect(source).toContain('startRenameLongPress')
    expect(source).toContain('onPointerDown={() => startRenameLongPress(agent)}')
    expect(source).toContain('/api/v1/agents/')
    expect(source).not.toContain('Pencil')
    expect(source).not.toContain('title={t("chat.renameAgent")}')
  })

  it('renders per-agent activity indicators', () => {
    expect(source).toContain('AgentStatusIndicator')
    expect(source).toContain('agentActivities')
    expect(source).toContain('chat.agentRunningStatus')
    expect(source).toContain('chat.agentUnreadStatus')
    expect(source).toContain('chat.agentErrorStatus')
    expect(source).toContain('flex size-5 shrink-0 items-center justify-center')
  })

  it('does not infer running state from active chat sessions', () => {
    expect(source).toContain('activity?.state === "running"')
    expect(source).not.toContain('runningAgentKeys')
    expect(source).not.toContain('session.isActive')
    expect(source).not.toContain('useChatSessions')
  })

  it('does not clear running activity when selecting an agent', () => {
    expect(source).toContain('selectedActivity?.state !== "running"')
    expect(source).toContain('qc.invalidateQueries({ queryKey: chatKeys.history(selectedActivity.sessionId) })')
  })
})
