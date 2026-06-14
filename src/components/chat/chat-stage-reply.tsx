"use client"

import { Wrench } from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface ChatStageReplyProps {
  text: string
  /** Active tool name shown in a light-yellow badge before the text. */
  toolName?: string
}

/**
 * Staged (in-progress) reply — grey italic markdown with an optional
 * tool-name badge in light yellow.  Updated in-place as preamble events
 * stream in; replaced by the final ChatTextBlock when the run completes.
 */
export function ChatStageReply({ text, toolName }: ChatStageReplyProps) {
  return (
    <div className="py-1 text-sm text-muted-foreground/70">
      {toolName && (
        <span className="inline-flex items-center gap-1 mr-1.5 rounded bg-yellow-100 dark:bg-yellow-900/30 px-1.5 py-0.5 text-[11px] text-yellow-800 dark:text-yellow-200 font-medium align-middle">
          <Wrench className="size-2.5" />
          {toolName}
        </span>
      )}
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  )
}
