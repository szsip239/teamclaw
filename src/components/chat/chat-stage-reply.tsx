"use client"

import { Wrench } from "lucide-react"

interface ChatStageReplyProps {
  text: string
  toolName?: string
}

/**
 * Staged reply — one line: optional 🔧 toolName · description.
 * Grey italic, slightly smaller than body text.  Updated in-place while
 * the agent runs; replaced by the final ChatTextBlock when done.
 */
export function ChatStageReply({ text, toolName }: ChatStageReplyProps) {
  const full = toolName ? `${toolName} · ${text}` : text
  if (!full) return null
  return (
    <div className="flex items-center gap-1.5 py-1 text-[13px] text-muted-foreground/60 italic leading-relaxed">
      {toolName && <Wrench className="size-3 shrink-0 opacity-50" />}
      <span className="truncate">{full}</span>
    </div>
  )
}
