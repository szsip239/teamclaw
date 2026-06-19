import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/chat/chat-session-list.tsx'), 'utf-8')

describe('ChatSessionList display', () => {
  it('does not show runtime labels in the recent session subtitle', () => {
    expect(source).not.toContain('runtimeLabel')
    expect(source).not.toContain("t('chat.runtimePi')")
    expect(source).not.toContain("t('chat.runtimeOpenclaw')")
  })
})
