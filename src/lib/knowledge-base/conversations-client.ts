/**
 * Browser-side client for the KB conversation REST API.
 * Plain fetch — the routes go through the same /api/v1/* auth proxy as
 * the rest of the app, so the JWT cookie is enough.
 */

export interface ConversationSummary {
  id: string
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

export interface PersistedMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning: string | null
  stage: string | null
  error: boolean
  stopped: boolean
  answerSources: unknown
  answerAssets: unknown
  retrievalGroups: unknown
  createdAt: string
}

export interface ConversationDetail {
  conversation: {
    id: string
    title: string
    createdAt: string
    updatedAt: string
  }
  messages: PersistedMessage[]
}

const base = (kbId: string) => `/api/v1/knowledge-bases/${kbId}/conversations`

export async function listConversations(kbId: string): Promise<ConversationSummary[]> {
  const res = await fetch(base(kbId), { credentials: 'include' })
  if (!res.ok) return []
  const json = await res.json()
  return json.conversations ?? []
}

export async function createConversation(
  kbId: string,
  title?: string,
): Promise<ConversationSummary> {
  const res = await fetch(base(kbId), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('create conversation failed')
  return res.json()
}

export async function renameConversation(
  kbId: string,
  convId: string,
  title: string,
): Promise<void> {
  const res = await fetch(`${base(kbId)}/${convId}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  if (!res.ok) throw new Error('rename conversation failed')
}

export async function deleteConversation(kbId: string, convId: string): Promise<void> {
  const res = await fetch(`${base(kbId)}/${convId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('delete conversation failed')
}

export async function loadConversation(
  kbId: string,
  convId: string,
): Promise<ConversationDetail> {
  const res = await fetch(`${base(kbId)}/${convId}/messages`, {
    credentials: 'include',
  })
  if (!res.ok) throw new Error('load conversation failed')
  return res.json()
}

export async function deleteMessage(
  kbId: string,
  convId: string,
  msgId: string,
): Promise<void> {
  const res = await fetch(`${base(kbId)}/${convId}/messages/${msgId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error('delete message failed')
}

export async function appendMessage(
  kbId: string,
  convId: string,
  payload: {
    role: 'user' | 'assistant'
    content: string
    reasoning?: string | null
    stage?: string | null
    error?: boolean
    stopped?: boolean
    answerSources?: unknown
    answerAssets?: unknown
    retrievalGroups?: unknown
    autoTitle?: boolean
  },
): Promise<void> {
  const res = await fetch(`${base(kbId)}/${convId}/messages`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('persist message failed')
}
