'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useChatStore } from '@/stores/chat-store'
import { chatKeys, useChatSessions, useChatHistory } from '@/hooks/use-chat'
import { ChatHeader } from './chat-header'
import { ChatMessageList } from './chat-message-list'
import { ChatInput } from './chat-input'
import { ChatWelcome } from './chat-welcome'
import {
  assembleHistoryMessages,
  latestUserTurnHasFinalAssistant,
} from '@/lib/chat/message-assembly'

export function ChatMain() {
  const selectedAgent = useChatStore((s) => s.selectedAgent)
  const selectedRuntime = useChatStore((s) => s.selectedRuntime)
  const setMessages = useChatStore((s) => s.setMessages)
  const setConnectionStatus = useChatStore((s) => s.setConnectionStatus)
  const activeSessionId = useChatStore((s) => s.activeSessionId)
  const setActiveSessionId = useChatStore((s) => s.setActiveSessionId)
  const messagesLength = useChatStore((s) => s.messages.length)
  const isStreaming = useChatStore((s) => s.isStreaming)
  const setRemoteStreaming = useChatStore((s) => s.setRemoteStreaming)
  const qc = useQueryClient()

  // Find existing session for the selected agent.
  // Prefer active session, fall back to the most recent inactive one (e.g. after gateway restart).
  const { data: sessions } = useChatSessions()
  const isSelectedSession = (session: NonNullable<typeof sessions>[number]) =>
    !!selectedAgent &&
    session.instanceId === selectedAgent.instanceId &&
    session.agentId === selectedAgent.agentId &&
    session.runtime === selectedRuntime
  const activeMatchingSession = activeSessionId
    ? sessions?.find((s) => s.id === activeSessionId && isSelectedSession(s))
    : null
  const fallbackMatchingSession =
    sessions?.find((s) => isSelectedSession(s) && s.isActive) ??
    sessions?.find((s) => isSelectedSession(s)) ??
    null
  const matchingSession = selectedAgent
    ? (activeMatchingSession ?? fallbackMatchingSession)
    : null

  // Fetch history when we have a matching session
  const {
    data: historyData,
    isLoading: isLoadingHistoryQuery,
    dataUpdatedAt,
  } = useChatHistory(matchingSession?.id ?? null)

  // Track which session + data version we've already loaded to avoid
  // redundant re-applies while still picking up background refetch results.
  const loadedRef = useRef<{ sessionId: string; updatedAt: number } | null>(null)
  // Track whether we were streaming locally — used to prevent stale
  // historyData.isRunning from re-enabling remoteStreaming after streaming ends.
  const wasStreamingRef = useRef(false)

  // Set activeSessionId when we find a matching session
  useEffect(() => {
    if (matchingSession && activeSessionId !== matchingSession.id) {
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

    // During streaming, mark the ref so we know cached data may be stale.
    if (isStreaming) {
      wasStreamingRef.current = true
      return
    }

    if (!historyData || !dataUpdatedAt) return

    const assembled = assembleHistoryMessages(
      historyData.snapshots,
      historyData.currentMessages,
      historyData.isActive,
    )
    const latestTurnComplete = latestUserTurnHasFinalAssistant(assembled)
    const store = useChatStore.getState()
    const historyUserContents = new Set(
      assembled.filter((m) => m.role === 'user').map((m) => m.content),
    )
    const queuedMessagesRepresented = store.queuedMessages.every((q) =>
      historyUserContents.has(q.content),
    )
    const pendingRunsStillActive =
      store.pendingQueuedRuns > 0 && !(latestTurnComplete && queuedMessagesRepresented)

    const alreadyLoaded =
      loadedRef.current?.sessionId === matchingSession.id &&
      loadedRef.current?.updatedAt === dataUpdatedAt &&
      messagesLength > 0

    // When streaming just ended, cached historyData.isRunning may be stale
    // (it was fetched before/during our run and never refreshed while
    // isStreaming was true). Keep suppressing isRunning until the server
    // confirms the run is no longer active — otherwise intermediate effect
    // re-runs (e.g. from syncFromHistory updating messagesLength) would
    // re-enable remoteStreaming with stale data, causing the three-dot
    // animation to briefly reappear after the reply has already arrived.
    if (wasStreamingRef.current && !historyData?.isRunning) {
      wasStreamingRef.current = false
    }
    const justFinishedStreaming = wasStreamingRef.current
    setRemoteStreaming(
      (!!historyData?.isRunning && !justFinishedStreaming && !latestTurnComplete) ||
        pendingRunsStillActive,
    )

    if (!alreadyLoaded) {
      loadedRef.current = { sessionId: matchingSession.id, updatedAt: dataUpdatedAt }
      // Don't overwrite existing messages with empty history — can happen when the
      // history fetch races ahead of gateway processing the first chat.send request.
      if (assembled.length > 0 || messagesLength === 0) {
        setMessages(assembled)

        // Reconcile queued messages (two concerns):
        if (store.queuedMessages.length > 0 || store.pendingQueuedRuns > 0) {
          // 1. Display: hide bubble once user msg appears in history
          const displayRemaining = store.queuedMessages.filter(
            (q) => !historyUserContents.has(q.content),
          )
          // 2. Polling: count responses that arrived
          let responsesArrived = 0
          for (const q of store.queuedMessages) {
            const idx = assembled.findIndex((m) => m.role === 'user' && m.content === q.content)
            if (idx === -1) continue
            if (assembled.slice(idx + 1).some((m) => m.role === 'assistant' && m.content)) {
              responsesArrived++
            }
          }
          // Fallback: queuedMessages already cleared by a prior poll but
          // pendingQueuedRuns still > 0. Check if the last user message has a response.
          if (
            responsesArrived === 0 &&
            store.queuedMessages.length === 0 &&
            store.pendingQueuedRuns > 0
          ) {
            if (latestTurnComplete) responsesArrived = store.pendingQueuedRuns
          }
          const updates: Record<string, unknown> = {}
          if (displayRemaining.length !== store.queuedMessages.length) {
            updates.queuedMessages = displayRemaining
          }
          if (responsesArrived > 0) {
            const newPending = Math.max(0, store.pendingQueuedRuns - responsesArrived)
            updates.pendingQueuedRuns = newPending
            if (newPending === 0 && !historyData.isRunning) {
              setRemoteStreaming(false)
            }
          } else if (latestTurnComplete && queuedMessagesRepresented) {
            updates.pendingQueuedRuns = 0
            setRemoteStreaming(false)
          }
          if (Object.keys(updates).length > 0) {
            useChatStore.setState(updates)
          }
        }
      }
      setConnectionStatus(historyData.connectionStatus ?? 'ok')
    }
  }, [
    historyData,
    matchingSession,
    setMessages,
    setConnectionStatus,
    setRemoteStreaming,
    messagesLength,
    dataUpdatedAt,
    isStreaming,
    selectedRuntime,
  ])

  if (!selectedAgent) {
    return (
      <div className="flex flex-1 min-w-0 flex-col">
        <ChatHeader />
        <ChatWelcome />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      <ChatHeader />
      <ChatMessageList isLoadingHistory={isLoadingHistoryQuery} />
      <ChatInput />
    </div>
  )
}
