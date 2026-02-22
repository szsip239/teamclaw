"use client"

import { useState } from "react"
import { ChevronDown, Brain } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/stores/language-store"

interface ChatThinkingBlockProps {
  content: string
}

export function ChatThinkingBlock({ content }: ChatThinkingBlockProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-muted-foreground/30 rounded-md border">
      <button
        type="button"
        className="text-muted-foreground flex w-full items-center gap-1.5 px-3 py-1.5 text-xs"
        onClick={() => setExpanded(!expanded)}
      >
        <Brain className="size-3" />
        <span>{t('chat.thinking')}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-3 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="text-muted-foreground border-t px-3 py-2 text-xs whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  )
}
