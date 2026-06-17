import type { ChatRuntime as DbChatRuntime } from '@/generated/prisma'

export type ChatRuntime = 'openclaw' | 'pi'

export const DEFAULT_CHAT_RUNTIME: ChatRuntime = 'openclaw'

export function normalizeChatRuntime(runtime: ChatRuntime | undefined | null): ChatRuntime {
  return runtime ?? DEFAULT_CHAT_RUNTIME
}

export function toDbChatRuntime(runtime: ChatRuntime | undefined | null): DbChatRuntime {
  return normalizeChatRuntime(runtime) === 'pi' ? 'PI' : 'OPENCLAW'
}

export function fromDbChatRuntime(runtime: DbChatRuntime | string | null | undefined): ChatRuntime {
  return runtime === 'PI' ? 'pi' : 'openclaw'
}

export function buildChatRuntimeSessionKey(
  runtime: ChatRuntime,
  agentId: string,
  userId: string,
): string {
  return runtime === 'pi'
    ? `agent:pi:${agentId}:tc:${userId}`
    : `agent:${agentId}:tc:${userId}`
}

export function instanceSupportsPiRuntime(dockerConfig: unknown): boolean {
  if (!dockerConfig || typeof dockerConfig !== 'object') return false
  const hostPiPort = (dockerConfig as Record<string, unknown>).hostPiPort
  return (
    (typeof hostPiPort === 'number' && Number.isInteger(hostPiPort) && hostPiPort > 0) ||
    (typeof hostPiPort === 'string' && /^\d+$/.test(hostPiPort) && Number(hostPiPort) > 0)
  )
}
