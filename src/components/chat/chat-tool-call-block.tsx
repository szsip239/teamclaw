"use client"

import { useState } from "react"
import { ChevronDown, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ChatToolCall } from "@/types/chat"

interface ChatToolCallBlockProps {
  toolCall: ChatToolCall
}

export function ChatToolCallBlock({ toolCall }: ChatToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-md border">
      <button
        type="button"
        className="text-muted-foreground flex w-full items-center gap-1.5 px-3 py-1.5 text-xs"
        onClick={() => setExpanded(!expanded)}
      >
        <Wrench className="size-3" />
        <span className="font-mono">{toolCall.toolName}</span>
        <ChevronDown
          className={cn(
            "ml-auto size-3 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>
      {expanded && (
        <div className="border-t px-3 py-2">
          {toolCall.toolInput != null && (
            <div className="mb-2">
              <p className="text-muted-foreground mb-1 text-[10px] font-medium uppercase">
                Input
              </p>
              <pre className="bg-muted overflow-x-auto rounded p-2 text-xs">
                <code>
                  {typeof toolCall.toolInput === "string"
                    ? toolCall.toolInput
                    : JSON.stringify(toolCall.toolInput, null, 2)}
                </code>
              </pre>
            </div>
          )}
          {toolCall.toolOutput != null && (
            <div>
              <p className="text-muted-foreground mb-1 text-[10px] font-medium uppercase">
                Output
              </p>
              <pre className="bg-muted overflow-x-auto rounded p-2 text-xs">
                <code>
                  {typeof toolCall.toolOutput === "string"
                    ? toolCall.toolOutput
                    : JSON.stringify(toolCall.toolOutput, null, 2)}
                </code>
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
