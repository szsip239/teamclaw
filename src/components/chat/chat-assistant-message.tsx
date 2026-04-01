'use client'

import { Bot } from 'lucide-react'
import type { ChatMessage } from '@/types/chat'
import { ChatProcessGroup } from './chat-process-group'
import { ChatThinkingBlock } from './chat-thinking-block'
import { ChatToolCallBlock } from './chat-tool-call-block'
import { ChatTextBlock } from './chat-text-block'
import { ChatErrorBlock } from './chat-error-block'
import { ChatImageBlock } from './chat-image-block'

interface ChatAssistantMessageProps {
  message: ChatMessage
  isStreaming: boolean
  /** Preceding intermediate messages (thinking/tool only) merged into this message */
  processSteps?: ChatMessage[]
}

export function ChatAssistantMessage({ message, isStreaming, processSteps }: ChatAssistantMessageProps) {
  // Determine if this message's own thinking/tools should use compact layout.
  // Use compact when there are 2+ items (thinking + toolCalls combined)
  // and the message also has content (final response).
  const ownThinkingToolCount =
    (message.thinking ? 1 : 0) + (message.toolCalls?.length ?? 0)
  const hasContent = !!message.content
  const useCompactOwn = hasContent && ownThinkingToolCount >= 1

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
        </div>
      </div>
    </div>
  )
}
