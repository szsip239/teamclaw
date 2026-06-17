import type { ChatRuntime } from '@/lib/chat/runtime'
import type { ChatSessionResponse } from '@/types/chat'

interface ResolveFilePanelSessionIdsOptions {
  activeSession: ChatSessionResponse | undefined
  activeSessionId: string
  selectedRuntime: ChatRuntime
}

export interface FilePanelSessionIds {
  detailSessionId: string
  inputSessionId: string
  outputSessionId: string
  watchSessionId: string
}

export function resolveFilePanelSessionIds({
  activeSession,
  activeSessionId,
  selectedRuntime,
}: ResolveFilePanelSessionIdsOptions): FilePanelSessionIds {
  const runtimeSessionId =
    activeSession?.sessionIdsByRuntime?.[selectedRuntime] ??
    activeSession?.sessionIdsByRuntime?.[activeSession.runtime] ??
    activeSessionId

  return {
    detailSessionId: runtimeSessionId,
    inputSessionId: runtimeSessionId,
    outputSessionId: activeSessionId,
    watchSessionId: runtimeSessionId,
  }
}
