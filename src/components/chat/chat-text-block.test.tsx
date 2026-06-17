import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/dynamic', () => ({
  default: () => function DynamicBlock() {
    return null
  },
}))

vi.mock('@/stores/chat-store', () => ({
  useChatStore: (selector: (state: { activeSessionId: string }) => unknown) =>
    selector({ activeSessionId: 'conversation-group' }),
}))

import { ChatTextBlock } from './chat-text-block'

describe('ChatTextBlock output links', () => {
  it('uses the source session id for generated file download links', () => {
    const html = renderToStaticMarkup(
      <ChatTextBlock content="[download](output/report.html)" sessionId="source-session" />,
    )

    expect(html).toContain('/api/v1/chat/sessions/source-session/files/output/report.html')
    expect(html).not.toContain('/api/v1/chat/sessions/conversation-group/files/output/report.html')
  })
})
