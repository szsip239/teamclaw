import type { ChatRuntime } from './runtime'
import type { ChatSessionResponse } from '@/types/chat'

export interface ChatSessionGroupInput
  extends Omit<
    ChatSessionResponse,
    'id' | 'runtime' | 'sessionIdsByRuntime' | 'runtimes' | 'conversationGroupId'
  > {
  id: string
  runtime: ChatRuntime
  conversationGroupId?: string | null
}

function groupIdForSession(session: ChatSessionGroupInput): string {
  return session.conversationGroupId || session.id
}

function sessionTime(session: Pick<ChatSessionGroupInput, 'lastMessageAt' | 'createdAt'>): number {
  return new Date(session.lastMessageAt ?? session.createdAt).getTime()
}

export function groupChatSessions(sessions: ChatSessionGroupInput[]): ChatSessionResponse[] {
  const groups = new Map<
    string,
    {
      representative: ChatSessionGroupInput
      sessions: ChatSessionGroupInput[]
    }
  >()

  for (const session of sessions) {
    const groupId = groupIdForSession(session)
    const existing = groups.get(groupId)
    if (!existing) {
      groups.set(groupId, { representative: session, sessions: [session] })
      continue
    }

    existing.sessions.push(session)
    if (sessionTime(session) >= sessionTime(existing.representative)) {
      existing.representative = session
    }
  }

  return [...groups.entries()]
    .map(([groupId, group]) => {
      const runtimes = [...new Set(group.sessions.map((session) => session.runtime))].sort(
        runtimeOrder,
      )
      const sessionIdsByRuntime = Object.fromEntries(
        group.sessions.map((session) => [session.runtime, session.id]),
      ) as Partial<Record<ChatRuntime, string>>
      const representative = group.representative

      return {
        id: groupId,
        conversationGroupId: groupId,
        sessionId: representative.sessionId,
        runtime: representative.runtime,
        runtimes,
        sessionIdsByRuntime,
        instanceId: representative.instanceId,
        instanceName: representative.instanceName,
        agentId: representative.agentId,
        agentName: representative.agentName,
        title: representative.title,
        lastMessageAt: representative.lastMessageAt,
        messageCount: group.sessions.reduce((sum, session) => sum + session.messageCount, 0),
        isActive: group.sessions.some((session) => session.isActive),
        createdAt: group.sessions
          .map((session) => session.createdAt)
          .sort()[0],
      }
    })
    .sort((a, b) => sessionTime(b) - sessionTime(a))
}

function runtimeOrder(a: ChatRuntime, b: ChatRuntime): number {
  const order: Record<ChatRuntime, number> = { openclaw: 0, pi: 1 }
  return order[a] - order[b]
}
