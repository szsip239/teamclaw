"use client"

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatStageReplyProps {
  text: string
}

/**
 * Staged (in-progress) reply — grey italic markdown, updated in-place as
 * preamble events stream in.  Renders with the same pipeline as ChatTextBlock
 * so markdown formatting (bold, code, lists) appears in real-time, not just
 * at the end.
 */
export function ChatStageReply({ text }: ChatStageReplyProps) {
  return (
    <div className="py-1 text-sm text-muted-foreground/70">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
