import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const headerSource = readFileSync(path.resolve('src/components/chat/chat-header.tsx'), 'utf-8')
const inputSource = readFileSync(path.resolve('src/components/chat/chat-input.tsx'), 'utf-8')
const iconSource = readFileSync(path.resolve('src/components/chat/chat-runtime-icon.tsx'), 'utf-8')

describe('Chat runtime controls', () => {
  it('removes the header runtime selector', () => {
    expect(headerSource).not.toContain('SelectTrigger')
    expect(headerSource).not.toContain('setSelectedRuntime')
    expect(headerSource).not.toContain("t('chat.runtimeLabel')")
  })

  it('renders normal/fast runtime and model control inside the input instead of a pi marker', () => {
    expect(inputSource).toContain('ChatRuntimeControl')
    expect(inputSource).toContain("t('chat.runtimeNormal')")
    expect(inputSource).toContain("t('chat.runtimeFast')")
    expect(inputSource).toContain("t('chat.modelLabel')")
    expect(inputSource).toContain('useChatModel')
    expect(inputSource).toContain('setSelectedRuntime')
    expect(inputSource).toContain('agentSupportsChatRuntime')
    expect(inputSource).not.toContain('ChatRuntimeIcon')
    expect(inputSource).not.toContain("[{t('chat.runtimePi')}]")
  })

  it('uses the approved robot image assets instead of hand-drawn runtime svg', () => {
    expect(iconSource).toContain('/icons/runtime-pi-robot.png?v=')
    expect(iconSource).toContain('/icons/runtime-normal-robot.png?v=')
    expect(iconSource).not.toContain('<svg')
  })
})
