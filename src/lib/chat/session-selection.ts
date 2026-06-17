import type { ChatAgentInfo, ChatSessionResponse } from '@/types/chat'

export function selectMatchingChatSession(
  sessions: ChatSessionResponse[] | undefined,
  selectedAgent: ChatAgentInfo | null,
  activeSessionId: string | null,
): ChatSessionResponse | null {
  if (!sessions || !selectedAgent) return null

  const isSelectedAgentSession = (session: ChatSessionResponse) =>
    session.instanceId === selectedAgent.instanceId && session.agentId === selectedAgent.agentId

  if (activeSessionId) {
    const activeSession = sessions.find((session) => session.id === activeSessionId)
    if (activeSession) {
      if (isSelectedAgentSession(activeSession)) return activeSession
    } else {
      // A freshly-created conversation is set as active before the sessions
      // query refetches. Do not fall back to the previous active group while
      // that cache miss is being resolved.
      return null
    }
  }

  return (
    sessions.find((session) => isSelectedAgentSession(session) && session.isActive) ??
    sessions.find(isSelectedAgentSession) ??
    null
  )
}
