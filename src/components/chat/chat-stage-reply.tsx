"use client"

import { Loader2 } from "lucide-react"

interface ChatStageReplyProps {
  text: string
}

/**
 * Staged (in-progress) reply shown during agent execution.
 * Grey italic text + spinning indicator — overwritten by each new
 * stage reply, and replaced by the final reply when the run completes.
 */
export function ChatStageReply({ text }: ChatStageReplyProps) {
  return (
    <div className="flex items-center gap-2 py-1">
      <Loader2 className="size-3 shrink-0 animate-spin text-muted-foreground/60" />
      <span className="text-sm text-muted-foreground/80">{text}</span>
    </div>
  )
}
