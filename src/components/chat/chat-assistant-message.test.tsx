import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/chat/chat-assistant-message.tsx'), 'utf-8')

describe('ChatAssistantMessage runtime badge', () => {
  it('renders translated runtime labels for assistant bubbles', () => {
    expect(source).toContain("t('chat.runtimePi')")
    expect(source).toContain("t('chat.runtimeOpenclaw')")
    expect(source).toContain('message.runtime ===')
  })
})
