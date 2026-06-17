import type { ChatSessionResponse } from '@/types/chat'

function sessionDisplayTime(session: Pick<ChatSessionResponse, 'lastMessageAt' | 'createdAt'>) {
  return new Date(session.lastMessageAt ?? session.createdAt).getTime()
}

export function sortChatSessionsForDisplay(
  sessions: ChatSessionResponse[],
): ChatSessionResponse[] {
  return [...sessions].sort((a, b) => sessionDisplayTime(b) - sessionDisplayTime(a))
}
