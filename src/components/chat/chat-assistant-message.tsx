"use client"

import { Bot } from "lucide-react"
import type { ChatMessage } from "@/types/chat"
import { ChatThinkingBlock } from "./chat-thinking-block"
import { ChatToolCallBlock } from "./chat-tool-call-block"
import { ChatTextBlock } from "./chat-text-block"
import { ChatErrorBlock } from "./chat-error-block"
import { ChatImageBlock } from "./chat-image-block"

interface ChatAssistantMessageProps {
  message: ChatMessage
  isStreaming: boolean
}

export function ChatAssistantMessage({
  message,
  isStreaming,
}: ChatAssistantMessageProps) {
  const hasContent = message.content || message.thinking || message.toolCalls?.length || message.contentBlocks?.length

  return (
    <div className="flex justify-start">
      <div className="flex max-w-[85%] items-start gap-2">
        <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
          <Bot className="size-3.5" />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          {message.thinking && (
            <ChatThinkingBlock content={message.thinking} />
          )}
          {message.toolCalls?.map((tc, i) => (
            <ChatToolCallBlock key={i} toolCall={tc} />
          ))}
          {message.content && (
            <ChatTextBlock content={message.content} />
          )}
          {message.contentBlocks?.map((block, i) =>
            block.type === "image" && block.imageUrl ? (
              <ChatImageBlock key={i} imageUrl={block.imageUrl} alt={block.alt} />
            ) : null,
          )}
          {!hasContent && isStreaming && (
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
