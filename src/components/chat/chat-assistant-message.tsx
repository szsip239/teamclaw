'use client'

import { Bot, ChevronDown } from 'lucide-react'
import type { ChatMessage, KbSourceRef } from '@/types/chat'
import { ChatProcessGroup } from './chat-process-group'
import { ChatThinkingBlock } from './chat-thinking-block'
import { ChatToolCallBlock } from './chat-tool-call-block'
import { ChatTextBlock } from './chat-text-block'
import { ChatErrorBlock } from './chat-error-block'
import { ChatImageBlock } from './chat-image-block'
import { useChatStore } from '@/stores/chat-store'
import { useT } from '@/stores/language-store'
import { selectVisibleKbSources } from '@/lib/chat/kb-sources'
import { useState } from 'react'

interface ChatAssistantMessageProps {
  message: ChatMessage
  isStreaming: boolean
  /** Preceding intermediate messages (thinking/tool only) merged into this message */
  processSteps?: ChatMessage[]
}

function KbSourceSection({ sources }: { sources: KbSourceRef[] }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)

  if (sources.length === 0) return null

  // Group sources by category
  const grouped: Record<string, KbSourceRef[]> = {}
  for (const s of sources) {
    if (!grouped[s.category]) grouped[s.category] = []
    grouped[s.category].push(s)
  }

  const categoryColors: Record<string, string> = {
    RULES: 'border-l-red-400 bg-red-50/50 dark:bg-red-950/20',
    INTERNAL: 'border-l-blue-400 bg-blue-50/50 dark:bg-blue-950/20',
    EXTERNAL: 'border-l-green-400 bg-green-50/50 dark:bg-green-950/20',
  }

  const categoryLabels: Record<string, string> = {
    RULES: t('kb.category.RULES'),
    INTERNAL: t('kb.category.INTERNAL'),
    EXTERNAL: t('kb.category.EXTERNAL'),
  }

  return (
    <div className="mt-2 rounded-lg border p-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 w-full text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown
          className={`size-3 transition-transform ${expanded ? 'rotate-0' : '-rotate-90'}`}
        />
        {t('chat.kbSources')} ({sources.length})
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {(['RULES', 'INTERNAL', 'EXTERNAL'] as const).map((cat) => {
            const items = grouped[cat]
            if (!items?.length) return null
            return (
              <div key={cat}>
                <p className="text-[10px] font-medium text-muted-foreground mb-1">
                  {categoryLabels[cat]}
                </p>
                <div className="space-y-1">
                  {items.map((s, i) => (
                    <div
                      key={i}
                      className={`border-l-2 rounded-r-md px-2 py-1 text-[11px] ${categoryColors[cat]}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground/80 truncate">{s.kbName}</p>
                          <p className="text-muted-foreground line-clamp-2 mt-0.5">{s.text}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                          {(s.score * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ChatAssistantMessage({ message, isStreaming, processSteps }: ChatAssistantMessageProps) {
  // Completed messages use their own sources; streaming messages use live sources.
  const liveKbSources = useChatStore((s) => s.kbSources)
  const kbSources = selectVisibleKbSources(message, isStreaming, liveKbSources)
  // Determine if this message's own thinking/tools should use compact layout.
  // Always compact when there are thinking or tool calls — even when content
  // was reclassified to thinking mid-stream (e.g. after a tool_call event).
  const ownThinkingToolCount =
    (message.thinking ? 1 : 0) + (message.toolCalls?.length ?? 0)
  const useCompactOwn = ownThinkingToolCount >= 1

  // Merge: if processSteps exist, combine them with this message's own thinking/tools
  // into a single compact process group.
  const allSteps = processSteps && processSteps.length > 0
    ? [...processSteps, ...(ownThinkingToolCount > 0 ? [message] : [])]
    : useCompactOwn
      ? [message]
      : null

  return (
    <div className="flex justify-start">
      <div className="flex w-full max-w-[92%] items-start gap-2">
        <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-3.5" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {allSteps ? (
            <ChatProcessGroup steps={allSteps} inline />
          ) : (
            <>
              {message.thinking && <ChatThinkingBlock content={message.thinking} />}
              {message.toolCalls?.map((tc, i) => (
                <ChatToolCallBlock key={i} toolCall={tc} />
              ))}
            </>
          )}
          {message.content && <ChatTextBlock content={message.content} />}
          {message.contentBlocks?.map((block, i) =>
            block.type === 'image' && block.imageUrl ? (
              <ChatImageBlock key={i} imageUrl={block.imageUrl} alt={block.alt} />
            ) : null,
          )}
          {isStreaming && !message.content && (
            <div className="flex items-center gap-1 py-2">
              <span className="bg-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
              <span className="bg-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
              <span className="bg-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
            </div>
          )}
          {isStreaming && message.content && (
            <span className="bg-foreground inline-block size-2 animate-pulse rounded-sm" />
          )}
          {message.error && <ChatErrorBlock error={message.error} />}
          {kbSources.length > 0 && <KbSourceSection sources={kbSources} />}
        </div>
      </div>
    </div>
  )
}
