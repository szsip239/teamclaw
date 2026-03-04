"use client"

import { memo, useRef, useEffect, useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChatStore } from "@/stores/chat-store"
import { useT } from "@/stores/language-store"
import { ChatMessageBubble } from "./chat-message-bubble"
import { ChatAssistantMessage } from "./chat-assistant-message"
import type { ChatMessage } from "@/types/chat"

const SEPARATOR_PREFIX = "__separator__:"

function isSeparator(content: string): string | null {
  if (content.startsWith(SEPARATOR_PREFIX)) {
    return content.slice(SEPARATOR_PREFIX.length)
  }
  return null
}

function ContextSeparator({ type }: { type: string }) {
  const t = useT()
  const label = type === "context-restart"
    ? t('chat.contextRestart')
    : t('chat.contextReset')

  return (
    <div className="flex items-center gap-2 py-3 text-muted-foreground text-xs">
      <div className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  )
}

function HistoryLoadingSkeleton() {
  const t = useT()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-center gap-2 py-8">
        <Loader2 className="text-muted-foreground size-4 animate-spin" />
        <span className="text-muted-foreground text-sm">{t('chat.loadingHistory')}</span>
      </div>
    </div>
  )
}

/** Memoized wrapper — only re-renders when the message object changes. */
const MemoizedMessage = memo(function MemoizedMessage({
  message,
}: {
  message: ChatMessage
}) {
  const separatorType = isSeparator(message.content)
  if (separatorType) {
    return <ContextSeparator type={separatorType} />
  }

  return message.role === "user" ? (
    <ChatMessageBubble message={message} />
  ) : (
    <ChatAssistantMessage message={message} isStreaming={false} />
  )
})

interface ChatMessageListProps {
  isLoadingHistory: boolean
}

export function ChatMessageList({ isLoadingHistory }: ChatMessageListProps) {
  const t = useT()
  const messages = useChatStore((s) => s.messages)
  const streamingMessage = useChatStore((s) => s.streamingMessage)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const connectionStatus = useChatStore((s) => s.connectionStatus)
  const bottomRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const handleScroll = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const threshold = 100
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold)
  }, [])

  // Auto-scroll when near bottom: on new messages or streaming content changes
  const messageCount = messages.length
  const streamingContent = streamingMessage?.content?.length ?? 0
  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "instant" })
    }
  }, [messageCount, streamingContent, isStreaming, isNearBottom])

  if (isLoadingHistory && messages.length === 0) {
    return (
      <ScrollArea className="flex-1">
        <HistoryLoadingSkeleton />
      </ScrollArea>
    )
  }

  return (
    <ScrollArea className="flex-1" viewportRef={viewportRef} onScroll={handleScroll}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        {connectionStatus === 'unreachable' && (
          <div className="flex items-center gap-2 rounded-md bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <span className="size-2 shrink-0 rounded-full bg-yellow-500" />
            {t('chat.gatewayUnreachable')}
          </div>
        )}
        {/* Completed messages — stable references, won't re-render on streaming deltas */}
        {messages.map((msg) => (
          <MemoizedMessage key={msg.id} message={msg} />
        ))}
        {/* Streaming message — isolated, only this component re-renders per delta */}
        {streamingMessage && (
          <ChatAssistantMessage
            key={streamingMessage.id}
            message={streamingMessage}
            isStreaming={isStreaming}
          />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
