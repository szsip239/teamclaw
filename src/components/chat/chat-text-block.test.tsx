import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/dynamic', () => ({
  default: (loader: () => Promise<unknown>) => {
    const loaderSource = String(loader)
    return function DynamicBlock(props: { optionJson?: string; code?: string }) {
      if (loaderSource.includes('chat-chart-block')) {
        return <div data-testid="chart-block">{props.optionJson}</div>
      }
      if (loaderSource.includes('chat-mermaid-block')) {
        return <div data-testid="mermaid-block">{props.code}</div>
      }
      return null
    }
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

  it('renders split echarts fences as chart blocks', () => {
    const html = renderToStaticMarkup(
      <ChatTextBlock content={'```\necharts\n{ "series": [] }\n```'} sessionId="source-session" />,
    )

    expect(html).toContain('data-testid="chart-block"')
    expect(html).toContain('{ &quot;series&quot;: [] }')
  })
})
