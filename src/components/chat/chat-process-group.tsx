"use client"

import { useState, useMemo } from "react"
import { Bot, Wrench, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { useT } from "@/stores/language-store"
import type { ChatMessage, ChatToolCall } from "@/types/chat"

interface ChatProcessGroupProps {
  steps: ChatMessage[]
  /** Render without Bot avatar (used inside ChatAssistantMessage) */
  inline?: boolean
}

interface ProcessStep {
  type: "thinking" | "tool"
  thinking?: string
  toolCall?: ChatToolCall
}

/** Extract a human-readable snippet from a tool call's input for the summary line. */
function toolDesc(tc: ChatToolCall): string {
  const raw = tc.toolInput
  if (raw == null || raw === '' || (typeof raw === 'object' && Object.keys(raw as Record<string,unknown>).length === 0)) return ''
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  return text
}

export function ChatProcessGroup({ steps, inline }: ChatProcessGroupProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)

  const { toolEntries, flatSteps } = useMemo(() => {
    const tools = new Map<string, number>()
    const flat: ProcessStep[] = []

    for (const step of steps) {
      // #13: thinking is hidden — don't add thinking flat steps.
      // Tool calls on the SAME message must still be processed.
      for (const tc of step.toolCalls ?? []) {
        tools.set(tc.toolName, (tools.get(tc.toolName) ?? 0) + 1)
        flat.push({ type: "tool", toolCall: tc })
      }
    }
    return {
      toolEntries: [...tools.entries()],
      flatSteps: flat,
    }
  }, [steps])

  // No tools to show → render nothing
  if (flatSteps.length === 0) return null

  const summaryBar = (
    <button
      type="button"
      className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5 text-left transition-colors hover:bg-muted/50"
      onClick={() => setExpanded(!expanded)}
    >
      {toolEntries.map(([name, count]) => (
        <span
          key={name}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <Wrench className="size-2.5" />
          <span className="font-mono">
            {count > 1 ? `${name} ×${count}` : name}
          </span>
        </span>
      ))}
      <span className="ml-auto flex items-center gap-1 text-[11px] text-muted-foreground/60 shrink-0">
        {t("chat.processSteps", { n: String(flatSteps.length) })}
        <ChevronRight
          className={cn(
            "size-3 transition-transform",
            expanded && "rotate-90",
          )}
        />
      </span>
    </button>
  )

  const detailPanel = expanded && (
    <div className="mt-1.5 space-y-px border-l-2 border-border/40 ml-1">
      {flatSteps.map((step, i) => {
        const isExpanded = expandedIdx === i
        if (step.type === "thinking") {
          return (
            <div key={i}>
              <button
                type="button"
                className="flex w-full items-start gap-1.5 rounded-r px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                <Brain className="mt-0.5 size-2.5 shrink-0 opacity-60" />
                <span className="line-clamp-1 flex-1 break-all">
                  {step.thinking!.slice(0, 120)}
                  {step.thinking!.length > 120 ? "…" : ""}
                </span>
                <ChevronRight
                  className={cn(
                    "mt-0.5 size-2.5 shrink-0 opacity-40 transition-transform",
                    isExpanded && "rotate-90",
                  )}
                />
              </button>
              {isExpanded && (
                <div className="ml-6 mr-2 mb-1 max-h-48 overflow-y-auto rounded bg-muted/30 px-2.5 py-2 text-[11px] text-muted-foreground/80 whitespace-pre-wrap">
                  {step.thinking}
                </div>
              )}
            </div>
          )
        }
        // tool call
        const tc = step.toolCall!
        return (
          <div key={i}>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 rounded-r px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:bg-muted/40"
              onClick={() => setExpandedIdx(isExpanded ? null : i)}
            >
              <Wrench className="size-2.5 shrink-0 opacity-60" />
              <span className="font-mono line-clamp-1 flex-1 break-all">
                {(() => {
                  const desc = toolDesc(tc)
                  return desc ? `${tc.toolName} ${desc}` : tc.toolName
                })()}
              </span>
              <ChevronRight
                className={cn(
                  "mt-0.5 ml-auto size-2.5 shrink-0 opacity-40 transition-transform",
                  isExpanded && "rotate-90",
                )}
              />
            </button>
            {isExpanded && (
              <div className="ml-6 mr-2 mb-1 space-y-1.5">
                {tc.toolInput != null && (
                  <div>
                    <p className="text-[10px] font-medium uppercase text-muted-foreground/50 mb-0.5">
                      {t("chat.toolInput")}
                    </p>
                    <pre className="max-h-32 overflow-auto rounded bg-muted/40 px-2 py-1.5 text-[11px]">
                      <code>
                        {typeof tc.toolInput === "string"
                          ? tc.toolInput
                          : JSON.stringify(tc.toolInput, null, 2)}
                      </code>
                    </pre>
                  </div>
                )}
                {tc.toolOutput != null && (
                  <div>
                    <p className="text-[10px] font-medium uppercase text-muted-foreground/50 mb-0.5">
                      {t("chat.toolOutput")}
                    </p>
                    <pre className="max-h-32 overflow-auto rounded bg-muted/40 px-2 py-1.5 text-[11px]">
                      <code>
                        {typeof tc.toolOutput === "string"
                          ? tc.toolOutput
                          : JSON.stringify(tc.toolOutput, null, 2)}
                      </code>
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  if (inline) {
    return (
      <div>
        {summaryBar}
        {detailPanel}
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[92%] items-start gap-2">
        <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {summaryBar}
          {detailPanel}
        </div>
      </div>
    </div>
  )
}
