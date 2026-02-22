"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { Loader2 } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useChatStore } from "@/stores/chat-store"
import { useT } from "@/stores/language-store"
import { ChatMessageBubble } from "./chat-message-bubble"
import { ChatAssistantMessage } from "./chat-assistant-message"

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

export function ChatMessageList() {
  const messages = useChatStore((s) => s.messages)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const isLoadingHistory = useChatStore((s) => s.isLoadingHistory)
  const bottomRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)

  const handleScroll = useCallback(() => {
    const el = viewportRef.current
    if (!el) return
    const threshold = 100
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold)
  }, [])

  // Auto-scroll when near bottom: on new messages or streaming state changes
  const messageCount = messages.length
  useEffect(() => {
    if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messageCount, isStreaming, isNearBottom])

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
        {messages.map((msg) => {
          // Check if this is a separator message
          const separatorType = isSeparator(msg.content)
          if (separatorType) {
            return <ContextSeparator key={msg.id} type={separatorType} />
          }

          return msg.role === "user" ? (
            <ChatMessageBubble key={msg.id} message={msg} />
          ) : (
            <ChatAssistantMessage
              key={msg.id}
              message={msg}
              isStreaming={
                isStreaming &&
                msg.id === messages[messages.length - 1]?.id
              }
            />
          )
        })}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
