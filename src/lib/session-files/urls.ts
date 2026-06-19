import type { SessionFileEntry } from '@/types/session-files'
import type { SessionFileZone } from './helpers'

export function buildSessionFileUrl(
  sessionId: string,
  zone: SessionFileZone,
  entry: SessionFileEntry,
): string {
  const fileSessionId = entry.sourceSessionId ?? sessionId
  return `/api/v1/chat/sessions/${fileSessionId}/files/${zone}/${entry.path}`
}
