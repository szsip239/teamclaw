import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(path.resolve('src/components/chat/chat-message-list.tsx'), 'utf-8')

describe('ChatMessageList process-only rendering', () => {
  it('does not show streaming dots for persisted process-only history groups', () => {
    const processOnlyBranch = source.slice(
      source.indexOf("if (item.type === 'process-only')"),
      source.indexOf('// Get the display message ID for selection tracking'),
    )

    expect(processOnlyBranch).toContain('isStreaming={false}')
    expect(processOnlyBranch).not.toContain('isStreaming={isStreaming || remoteStreaming}')
  })
})
