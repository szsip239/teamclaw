"use client"

import { useEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useChatStore } from "@/stores/chat-store"
import { chatKeys, useChatSessions, useChatHistory } from "@/hooks/use-chat"
import { ChatHeader } from "./chat-header"
import { ChatMessageList } from "./chat-message-list"
import { ChatInput } from "./chat-input"
import { ChatWelcome } from "./chat-welcome"
import { assembleHistoryMessages } from "@/lib/chat/message-assembly"

export function ChatMain() {
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const setMessages = useChatStore((s) => s.setMessages)
  const setConnectionStatus = useChatStore((s) => s.setConnectionStatus)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const setActiveSessionId = useChatStore((s) => s.setActiveSessionId)
  const messagesLength = useChatStore((s) => s.messages.length)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const qc = useQueryClient()

  // Find existing session for the selected agent.
  // Prefer active session, fall back to the most recent inactive one (e.g. after gateway restart).
  const { data: sessions } = useChatSessions()
  const matchingSession = selectedAgent
    ? (activeSessionId
        ? sessions?.find((s) => s.id === activeSessionId)
        : sessions?.find(
            (s) =>
              s.instanceId === selectedAgent.instanceId &&
              s.agentId === selectedAgent.agentId &&
              s.isActive,
          ) ??
          sessions?.find(
            (s) =>
              s.instanceId === selectedAgent.instanceId &&
              s.agentId === selectedAgent.agentId,
          )
      ) ?? null
    : null

  // Fetch history when we have a matching session
  const { data: historyData, isLoading: isLoadingHistoryQuery, dataUpdatedAt } =
    useChatHistory(matchingSession?.id ?? null)

  // Track which session + data version we've already loaded to avoid
  // redundant re-applies while still picking up background refetch results.
  const loadedRef = useRef<{ sessionId: string; updatedAt: number } | null>(null)

  // Set activeSessionId when we find a matching session
  useEffect(() => {
    if (matchingSession && !activeSessionId) {
      setActiveSessionId(matchingSession.id)
    }
  }, [matchingSession, activeSessionId, setActiveSessionId])

  // When activeSessionId is set (e.g. by session SSE event) but the sessions
  // query doesn't include it yet, refetch the sessions list
  useEffect(() => {
    if (activeSessionId && sessions && !sessions.find((s) => s.id === activeSessionId)) {
      qc.invalidateQueries({ queryKey: chatKeys.sessions() })
    }
  }, [activeSessionId, sessions, qc])

  // When history data arrives or updates, assemble the full message list.
  // Skip during streaming to avoid overwriting real-time content.
  // Re-apply when: session changes, data refreshes (dataUpdatedAt), or messages cleared.
  useEffect(() => {
    if (!matchingSession) {
      loadedRef.current = null
      return
    }
    if (!historyData || !dataUpdatedAt || isStreaming) return

    const alreadyLoaded =
      loadedRef.current?.sessionId === matchingSession.id &&
      loadedRef.current?.updatedAt === dataUpdatedAt &&
      messagesLength > 0

    if (!alreadyLoaded) {
      loadedRef.current = { sessionId: matchingSession.id, updatedAt: dataUpdatedAt }
      const assembled = assembleHistoryMessages(
        historyData.snapshots,
        historyData.currentMessages,
        historyData.isActive,
      )
      // Don't overwrite existing messages with empty history — can happen when the
      // history fetch races ahead of gateway processing the first chat.send request.
      if (assembled.length > 0 || messagesLength === 0) {
        setMessages(assembled)
      }
      setConnectionStatus(historyData.connectionStatus ?? 'ok')
    }
  }, [historyData, matchingSession, setMessages, setConnectionStatus, messagesLength, dataUpdatedAt, isStreaming])

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
      <ChatMessageList isLoadingHistory={isLoadingHistoryQuery} />
      <ChatInput />
    </div>
  )
}
