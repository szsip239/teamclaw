import type { ChatAgentInfo } from '@/types/chat'
import type { ChatRuntime } from './runtime'

const FALLBACK_RUNTIMES: ChatRuntime[] = ['openclaw']

export function getAvailableChatRuntimes(
  agent:
    | { availableRuntimes?: readonly ChatRuntime[] | null }
    | Pick<ChatAgentInfo, 'availableRuntimes'>
    | null
    | undefined,
): ChatRuntime[] {
  const runtimes = agent?.availableRuntimes?.length ? agent.availableRuntimes : FALLBACK_RUNTIMES
  return runtimes.includes('openclaw') ? [...runtimes] : ['openclaw', ...runtimes]
}

export function agentSupportsChatRuntime(
  agent: Parameters<typeof getAvailableChatRuntimes>[0],
  runtime: ChatRuntime,
): boolean {
  return getAvailableChatRuntimes(agent).includes(runtime)
}

export function ensureChatRuntimeForAgent(
  agent: Parameters<typeof getAvailableChatRuntimes>[0],
  runtime: ChatRuntime,
): ChatRuntime {
  return agentSupportsChatRuntime(agent, runtime) ? runtime : 'openclaw'
}
