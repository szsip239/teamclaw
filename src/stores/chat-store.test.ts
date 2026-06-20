import { readFileSync } from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  afterEach(() => {
    vi.restoreAllMocks()
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

  it('keeps the running session id when refreshing running state', () => {
    const key = chatAgentActivityKey('sales', 'main')

    useChatStore.getState().markAgentRunning('sales', 'main', 'session-1')
    useChatStore.getState().markAgentRunning('sales', 'main')

    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'running',
      unreadCount: 0,
      sessionId: 'session-1',
    })
  })

  it('keeps the session id when a running activity becomes done or error', () => {
    const key = chatAgentActivityKey('sales', 'main')

    useChatStore.getState().markAgentRunning('sales', 'main', 'session-1')
    useChatStore.getState().markAgentDone('sales', 'main')

    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'done',
      unreadCount: 1,
      sessionId: 'session-1',
    })

    useChatStore.getState().markAgentRunning('sales', 'main', 'session-2')
    useChatStore.getState().markAgentError('sales', 'main')

    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'error',
      unreadCount: 1,
      sessionId: 'session-2',
    })
  })

  it('reconciles a detached running agent to an unread done state from history', async () => {
    const key = chatAgentActivityKey('sales', 'main')
    useChatStore.getState().markAgentRunning('sales', 'main', 'session-1')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          snapshots: [],
          currentMessages: [
            { id: 'u1', role: 'user', content: 'hello', createdAt: '2026-06-20T00:00:00.000Z' },
            {
              id: 'a1',
              role: 'assistant',
              content: 'done',
              isFinal: true,
              createdAt: '2026-06-20T00:00:01.000Z',
            },
          ],
          isActive: true,
        }),
      })),
    )

    await useChatStore.getState().reconcileAgentActivity('sales', 'main', 'session-1')

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/chat/sessions/session-1/history?polling=true',
      { credentials: 'include' },
    )
    expect(useChatStore.getState().agentActivities[key]).toEqual({
      state: 'done',
      unreadCount: 1,
      sessionId: 'session-1',
    })
  })

  it('refreshes chat queries after detached activity reconciliation completes', () => {
    expect(source).toContain("qc.invalidateQueries({ queryKey: ['chat', 'sessions'] })")
    expect(source).toContain("qc.invalidateQueries({ queryKey: ['chat', 'history', sessionId] })")
  })
})
