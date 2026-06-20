import { readFileSync } from 'fs'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { chatAgentActivityKey, useChatStore } from './chat-store'

const source = readFileSync(path.resolve('src/stores/chat-store.ts'), 'utf-8')

describe('chat store history sync', () => {
  it('reports success after replacing messages from history', () => {
    const syncBlock = source.slice(
      source.indexOf('async function syncFromHistory'),
      source.indexOf('export const useChatStore'),
    )
    const setMessagesIndex = syncBlock.indexOf('set({ messages: assembled })')
    const returnTrueIndex = syncBlock.indexOf('return true', setMessagesIndex)
    const emptyHistoryReturnIndex = syncBlock.indexOf('return false // empty assembled')

    expect(setMessagesIndex).toBeGreaterThan(-1)
    expect(returnTrueIndex).toBeGreaterThan(setMessagesIndex)
    expect(returnTrueIndex).toBeLessThan(emptyHistoryReturnIndex)
  })
})

describe('chat store runtime wiring', () => {
  it('keeps selected runtime in state and aborts before switching during streaming', () => {
    expect(source).toContain('selectedRuntime: ChatRuntime')
    expect(source).toContain('setSelectedRuntime: (runtime) => {')
    expect(source).toContain('current.abortChat()')
    expect(source).toContain('set({ selectedRuntime: nextRuntime })')
  })

  it('passes runtime through send, queue, and abort requests', () => {
    expect(source).toContain('{ instanceId, agentId, runtime, message, sessionId')
    expect(source).toContain('runtime,\n        message,')
    expect(source).toContain('runtime: selectedRuntime')
  })
})

describe('chat store stream errors', () => {
  it('maps pi connection loss to a translated message', () => {
    expect(source).toContain('chat.piConnectionLost')
    expect(source).toContain('Pi agent connection lost')
  })
})

describe('chat store agent activity indicators', () => {
  beforeEach(() => {
    useChatStore.setState({ agentActivities: {} })
  })

  it('tracks running, done, error, and cleared agent activity states', () => {
    const key = chatAgentActivityKey('inst-1', 'main')

    useChatStore.getState().markAgentRunning('inst-1', 'main')
    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'running',
      unreadCount: 0,
    })

    useChatStore.getState().markAgentDone('inst-1', 'main')
    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'done',
      unreadCount: 1,
    })

    useChatStore.getState().markAgentError('inst-1', 'main')
    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'error',
      unreadCount: 1,
    })

    useChatStore.getState().clearAgentActivity('inst-1', 'main')
    expect(useChatStore.getState().agentActivities[key]).toBeUndefined()
  })
})
