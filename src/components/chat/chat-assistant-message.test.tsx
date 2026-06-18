import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/chat/chat-assistant-message.tsx'), 'utf-8')

describe('ChatAssistantMessage runtime avatar', () => {
  it('identifies assistant runtime with avatars instead of bracket labels', () => {
    expect(source).toContain('ChatRuntimeAvatar')
    expect(source).toContain("message.runtime === 'pi'")
    expect(source).toContain('ChatRuntimeIcon')
    expect(source).not.toContain('<svg')
    expect(source).not.toContain('Bot')
    expect(source).not.toContain('Zap')
    expect(source).not.toContain('runtimeLabel')
    expect(source).not.toContain('[{runtimeLabel}]')
  })
})
