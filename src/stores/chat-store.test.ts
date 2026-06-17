import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

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
