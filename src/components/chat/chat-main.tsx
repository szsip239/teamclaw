"use client"

import { useEffect, useRef } from "react"
import { useChatStore } from "@/stores/chat-store"
import { useChatSessions, useChatHistory } from "@/hooks/use-chat"
import { ChatHeader } from "./chat-header"
import { ChatMessageList } from "./chat-message-list"
import { ChatInput } from "./chat-input"
import { ChatWelcome } from "./chat-welcome"
import type { ChatMessage, ChatSnapshotBatch } from "@/types/chat"

export function ChatMain() {
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const setMessages = useChatStore((s) => s.setMessages)
  const setLoadingHistory = useChatStore((s) => s.setLoadingHistory)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const setActiveSessionId = useChatStore((s) => s.setActiveSessionId)
  const messagesLength = useChatStore((s) => s.messages.length)

  // Find existing active session for the selected agent
  const { data: sessions } = useChatSessions()
  const matchingSession = selectedAgent
    ? (activeSessionId
        ? sessions?.find((s) => s.id === activeSessionId)
        : sessions?.find(
            (s) =>
              s.instanceId === selectedAgent.instanceId &&
              s.agentId === selectedAgent.agentId &&
              s.isActive,
          )
      ) ?? null
    : null

  // Fetch history when we have a matching session
  const { data: historyData, isLoading: isLoadingHistoryQuery } =
    useChatHistory(matchingSession?.id ?? null)

  // Track which session's history we've already loaded to avoid re-applying
  const loadedSessionRef = useRef<string | null>(null)

  useEffect(() => {
    setLoadingHistory(isLoadingHistoryQuery)
  }, [isLoadingHistoryQuery, setLoadingHistory])

  // Set activeSessionId when we find a matching session
  useEffect(() => {
    if (matchingSession && !activeSessionId) {
      setActiveSessionId(matchingSession.id)
    }
  }, [matchingSession, activeSessionId, setActiveSessionId])

  // When history data arrives, assemble the full message list with separators.
  // Also reload when messages were cleared (messagesLength === 0) to handle
  // switching back to a previously viewed conversation.
  useEffect(() => {
    if (!matchingSession) {
      loadedSessionRef.current = null
      return
    }
    if (!historyData) return
    const needsLoad =
      matchingSession.id !== loadedSessionRef.current || messagesLength === 0
    if (needsLoad) {
      loadedSessionRef.current = matchingSession.id
      const assembled = assembleMessages(
        historyData.snapshots,
        historyData.currentMessages,
        historyData.isActive,
      )
      setMessages(assembled)
    }
  }, [historyData, matchingSession, setMessages, messagesLength])

  if (!selectedAgent) {
    return (
      <div className="flex flex-1 flex-col">
        <ChatHeader />
        <ChatWelcome />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ChatHeader />
      <ChatMessageList />
      <ChatInput />
    </div>
  )
}

/**
 * Assemble snapshots and current messages into a single list,
 * inserting separator markers between context resets.
 */
function assembleMessages(
  snapshots: ChatSnapshotBatch[],
  currentMessages: ChatMessage[],
  isActive: boolean,
): ChatMessage[] {
  const result: ChatMessage[] = []

  for (let i = 0; i < snapshots.length; i++) {
    result.push(...snapshots[i].messages)

    // Insert separator after each batch
    const isLastBatch = i === snapshots.length - 1
    const hasMoreContent = !isLastBatch || (isActive && currentMessages.length > 0)
    if (hasMoreContent) {
      result.push(createSeparator("context-reset", `sep-${snapshots[i].batchId}`))
    }
  }

  if (isActive && currentMessages.length > 0) {
    result.push(...currentMessages)
  } else if (!isActive && snapshots.length > 0) {
    // Non-active session — show "context restart" separator if new messages arrive later
    // (handled by the store when streaming starts on a reactivated session)
  }

  return result
}

/**
 * Create a special "separator" message used by ChatMessageList to render dividers.
 */
function createSeparator(
  type: "context-reset" | "context-restart",
  id: string,
): ChatMessage {
  return {
    id,
    role: "assistant" as const,
    content: `__separator__:${type}`,
    createdAt: new Date().toISOString(),
  }
}
