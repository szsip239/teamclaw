"use client"

interface ChatStageReplyProps {
  text: string
}

/**
 * Staged (in-progress) reply — grey italic text, updated in-place as
 * preamble events stream in.  Replaced by the final ChatTextBlock when
 * the run completes. Handover effect: the store delays clearing the
 * streaming message by 300ms so the grey text briefly overlaps the
 * final text appearing in the message history.
 */
export function ChatStageReply({ text }: ChatStageReplyProps) {
  return (
    <div className="py-1 text-sm text-muted-foreground/70 italic">
      {text}
    </div>
  )
}
