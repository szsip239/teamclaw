"use client"

import { memo, useRef, useEffect, useState, useCallback } from "react"
import { Bot, Loader2, RefreshCw, Plus } from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { useChatStore } from "@/stores/chat-store"
import { chatKeys, useNewConversation } from "@/hooks/use-chat"
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

function SessionLostBanner() {
  const t = useT()
  const qc = useQueryClient()
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const clearMessages = useChatStore((s) => s.clearMessages)
  const setActiveSessionId = useChatStore((s) => s.setActiveSessionId)
  const newConversation = useNewConversation()
  const [retrying, setRetrying] = useState(false)

  function handleRetry() {
    if (!activeSessionId) return
    setRetrying(true)
    qc.invalidateQueries({ queryKey: chatKeys.history(activeSessionId) })
      .finally(() => setRetrying(false))
  }

  function handleNewConversation() {
    if (!selectedAgent) return
    newConversation.mutate(
      { instanceId: selectedAgent.instanceId, agentId: selectedAgent.agentId },
      {
        onSuccess: (data) => {
          clearMessages()
          setActiveSessionId(data.session.id)
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <span className="size-2 shrink-0 rounded-full bg-amber-500" />
        {t('chat.sessionLost')}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
          {t('chat.sessionRetry')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={handleNewConversation}
          disabled={newConversation.isPending}
        >
          {newConversation.isPending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
          {t('chat.sessionNewConversation')}
        </Button>
      </div>
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
  const remoteStreaming = useChatStore((s) => s.remoteStreaming)
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
  }, [messageCount, streamingContent, isStreaming, remoteStreaming, isNearBottom])

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
        {connectionStatus === 'session-lost' && <SessionLostBanner />}
        {messages.map((msg) => (
          <MemoizedMessage key={msg.id} message={msg} />
        ))}
        {streamingMessage && (
          <ChatAssistantMessage
            key={streamingMessage.id}
            message={streamingMessage}
            isStreaming={isStreaming}
          />
        )}
        {remoteStreaming && !streamingMessage && (
          <div className="flex justify-start">
            <div className="flex max-w-[85%] items-start gap-2">
              <div className="bg-muted flex size-7 shrink-0 items-center justify-center rounded-full">
                <Bot className="size-3.5" />
              </div>
              <div className="flex items-center gap-1 py-2">
                <span className="bg-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
                <span className="bg-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
                <span className="bg-foreground/60 size-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  )
}
