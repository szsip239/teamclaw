import { create } from 'zustand'
import { streamChat } from '@/lib/chat-stream'
import { assembleFromResponse } from '@/lib/chat/message-assembly'
import type { ChatAgentInfo, ChatMessage, ChatToolCall, ChatHistoryResponse, ChatAttachment, ChatContentBlock } from '@/types/chat'

interface ChatState {
  // Selected agent
  selectedAgent: ChatAgentInfo | null
  setSelectedAgent: (agent: ChatAgentInfo | null) => void

  // Active session tracking
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void

  // Completed messages (stable during streaming — no array copies per delta)
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void

  // Streaming message — isolated from messages[] to avoid full-list re-renders.
  // Only components subscribing to streamingMessage re-render on each delta.
  streamingMessage: ChatMessage | null

  // Streaming mutations (operate on streamingMessage, not messages[])
  addUserMessage: (content: string, attachments?: ChatAttachment[]) => void
  appendAssistantContent: (content: string) => void
  appendAssistantImage: (imageUrl: string, mimeType?: string, alt?: string) => void
  appendThinking: (content: string) => void
  appendToolCall: (toolCall: ChatToolCall) => void
  setAssistantError: (error: string) => void

  // Streaming state
  isStreaming: boolean
  setStreaming: (v: boolean) => void
  abortController: AbortController | null

  // Remote streaming: agent is running on the server but we're not streaming locally
  // (e.g. user switched away and came back while the agent was still generating)
  remoteStreaming: boolean
  setRemoteStreaming: (v: boolean) => void

  // Send message action
  sendMessage: (
    instanceId: string,
    agentId: string,
    message: string,
    sessionId?: string,
    attachments?: { name: string; content: string; mimeType: string; size: number; dataUrl: string }[],
  ) => Promise<void>

  // Session management
  clearMessages: () => void

  // Gateway connection status
  connectionStatus: 'ok' | 'unreachable' | 'session-lost'
  setConnectionStatus: (v: 'ok' | 'unreachable' | 'session-lost') => void

  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void

  // Mobile drawers (separate from desktop state — never read by desktop code)
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (v: boolean) => void
  mobileFilePanelOpen: boolean
  setMobileFilePanelOpen: (v: boolean) => void
}

/**
 * After streaming completes, replace messages with full history from the API.
 *
 * During streaming, the store only has 1 assistant message (text-only).
 * OpenClaw's gateway doesn't send tool events or thinking in chat events,
 * so the streaming view is incomplete. By syncing from history after streaming,
 * we get the full picture: all thinking blocks, tool calls, images, etc.
 * This ensures consistency between the post-streaming view and page refresh.
 */
async function syncFromHistory(
  activeSessionId: string,
  set: (partial: Partial<ChatState>) => void,
  opts?: { polling?: boolean },
) {
  try {
    const url = `/api/v1/chat/sessions/${activeSessionId}/history${opts?.polling ? '?polling=true' : ''}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return
    const data: ChatHistoryResponse = await res.json()
    const assembled = assembleFromResponse(data)

    // Don't overwrite existing messages with empty history — gateway may temporarily
    // return empty results mid-run (race condition between tool calls).
    if (assembled.length > 0) {
      // Preserve user-uploaded attachments and contentBlocks: gateway chat.history
      // doesn't return image attachments/blocks in user messages, so we carry them
      // forward from existing local messages. Match by message text content.
      const existing = useChatStore.getState().messages
      // Build ordered lookup: content → array of preserved data entries.
      // Multiple user messages with the same text each keep their own images.
      const preservedByContent = new Map<string, { attachments?: ChatAttachment[]; contentBlocks?: ChatContentBlock[] }[]>()
      for (const msg of existing) {
        if (msg.role !== 'user') continue
        if (!msg.attachments?.length && !msg.contentBlocks?.length) continue
        const key = msg.content
        const arr = preservedByContent.get(key) ?? []
        arr.push({
          ...(msg.attachments?.length ? { attachments: msg.attachments } : {}),
          ...(msg.contentBlocks?.length ? { contentBlocks: msg.contentBlocks } : {}),
        })
        preservedByContent.set(key, arr)
      }
      if (preservedByContent.size > 0) {
        const consumed = new Map<string, number>()
        for (const msg of assembled) {
          if (msg.role !== 'user') continue
          const arr = preservedByContent.get(msg.content)
          if (!arr) continue
          const idx = consumed.get(msg.content) ?? 0
          if (idx >= arr.length) continue
          const saved = arr[idx]
          consumed.set(msg.content, idx + 1)
          if (!msg.attachments?.length && saved.attachments) msg.attachments = saved.attachments
          if (!msg.contentBlocks?.length && saved.contentBlocks) msg.contentBlocks = saved.contentBlocks
        }
      }

      set({ messages: assembled })
    }
  } catch {
    // Silently fail — sync is a non-critical UI enhancement
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  selectedAgent: null,
  setSelectedAgent: (agent) => set({ selectedAgent: agent }),

  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),

  messages: [],
  streamingMessage: null,

  setMessages: (messages) => set({ messages }),

  addUserMessage: (content, attachments) => {
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      ...(attachments?.length ? { attachments } : {}),
    }
    set((s) => ({ messages: [...s.messages, msg] }))
  },

  appendAssistantImage: (imageUrl, mimeType, alt) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
      const blocks: ChatContentBlock[] = [...(msg.contentBlocks ?? [])]
      blocks.push({ type: 'image', imageUrl, mimeType, alt })
      return { streamingMessage: { ...msg, contentBlocks: blocks } }
    })
  },

  appendAssistantContent: (content) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
      return { streamingMessage: { ...msg, content: msg.content + content } }
    })
  },

  appendThinking: (content) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
      return {
        streamingMessage: {
          ...msg,
          thinking: (msg.thinking ?? '') + content,
        },
      }
    })
  },

  appendToolCall: (toolCall) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
      // When a tool call arrives, any accumulated content is intermediate
      // narration (e.g. "Let me calculate..."), not the final answer.
      // Move it into thinking so it renders in the collapsible block.
      const reclassifiedThinking =
        msg.content
          ? msg.content + (msg.thinking ? '\n\n' + msg.thinking : '')
          : msg.thinking
      return {
        streamingMessage: {
          ...msg,
          content: '',
          ...(reclassifiedThinking ? { thinking: reclassifiedThinking } : {}),
          toolCalls: [...(msg.toolCalls ?? []), toolCall],
        },
      }
    })
  },

  setAssistantError: (error) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
      return { streamingMessage: { ...msg, error } }
    })
  },

  isStreaming: false,
  setStreaming: (v) => set({ isStreaming: v }),
  abortController: null,

  remoteStreaming: false,
  setRemoteStreaming: (v) => set({ remoteStreaming: v }),

  sendMessage: async (instanceId, agentId, message, sessionId, attachments) => {
    const { addUserMessage } = get()
    // Capture session ID at start — may be updated by the 'session' SSE event
    // when the API creates a new session (activeSessionId was null)
    let capturedSessionId = get().activeSessionId

    // 1. Add user message (with attachment previews for UI)
    const uiAttachments: ChatAttachment[] | undefined = attachments?.map(a => ({
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      dataUrl: a.dataUrl,
    }))
    addUserMessage(message, uiAttachments)

    // 2. Create assistant placeholder as streamingMessage (not in messages[])
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }
    set({ streamingMessage: assistantMsg })

    // 3. Set streaming state
    const controller = new AbortController()
    set({ isStreaming: true, abortController: controller })

    // 3b. Progress polling — periodically sync from history to show intermediate
    // tool calls and thinking that SSE can't deliver (OpenClaw doesn't broadcast
    // tool events). This is the equivalent of the user pressing "refresh" every
    // few seconds, but automatic.
    let syncing = false
    const PROGRESS_POLL_INTERVAL = 5_000 // 5 seconds — fast enough to catch most tool calls
    const progressTimer = setInterval(() => {
      const sid = capturedSessionId || get().activeSessionId
      if (sid && get().isStreaming && !syncing) {
        syncing = true
        syncFromHistory(sid, set, { polling: true }).finally(() => { syncing = false })
      }
    }, PROGRESS_POLL_INTERVAL)

    try {
      // 4. Stream events
      // Build attachments payload (base64 only, no data URL prefix)
      const streamAttachments = attachments?.map(a => ({
        name: a.name,
        content: a.content,
        mimeType: a.mimeType,
      }))

      for await (const event of streamChat(
        { instanceId, agentId, message, sessionId, attachments: streamAttachments },
        controller.signal,
      )) {
        switch (event.type) {
          case 'session':
            // API sends the session ID as the first event — track it
            // so syncFromHistory works even when no sessionId was passed
            capturedSessionId = event.sessionId
            if (!get().activeSessionId) {
              set({ activeSessionId: event.sessionId })
            }
            break
          case 'text':
            get().appendAssistantContent(event.content)
            break
          case 'thinking':
            get().appendThinking(event.content)
            break
          case 'tool_call':
            get().appendToolCall({
              toolName: event.toolName,
              toolInput: event.toolInput,
            })
            break
          case 'tool_result':
            get().appendToolCall({
              toolName: event.toolName,
              toolInput: null,
              toolOutput: event.toolOutput,
            })
            break
          case 'image':
            get().appendAssistantImage(event.imageUrl, event.mimeType, event.alt)
            break
          case 'error':
            get().setAssistantError(event.error)
            break
          case 'done':
            break
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        get().setAssistantError((err as Error).message || 'Failed to send message')
      }
    } finally {
      clearInterval(progressTimer)

      // Merge streamingMessage into messages[] before clearing streaming state
      const finalStreaming = get().streamingMessage
      if (finalStreaming) {
        set((s) => ({
          messages: [...s.messages, finalStreaming],
          streamingMessage: null,
          isStreaming: false,
          remoteStreaming: false, // We just finished our own run — no remote streaming
          abortController: null,
        }))
      } else {
        set({ streamingMessage: null, isStreaming: false, remoteStreaming: false, abortController: null })
      }

      // 5. Sync with full history (gateway omits thinking + tool events during streaming)
      // Use captured ID to avoid reading a stale/changed activeSessionId.
      // Skip if session was cleared (abort) — don't restore messages the user deliberately removed.
      if (capturedSessionId && get().activeSessionId) {
        syncFromHistory(capturedSessionId, set)
      }

      // 6. Invalidate TanStack caches so isActive flags and history data are fresh.
      // Dynamic import avoids circular deps between Zustand store and React providers.
      try {
        const { getQueryClient } = await import('@/components/providers')
        const qc = getQueryClient()
        qc.invalidateQueries({ queryKey: ['chat', 'sessions'] })
        if (capturedSessionId) {
          qc.invalidateQueries({ queryKey: ['chat', 'history', capturedSessionId] })
        }
      } catch { /* non-fatal */ }
    }
  },

  clearMessages: () => {
    const { abortController } = get()
    if (abortController) abortController.abort()
    set({ messages: [], streamingMessage: null, isStreaming: false, abortController: null, activeSessionId: null, connectionStatus: 'ok', remoteStreaming: false })
  },

  connectionStatus: 'ok',
  setConnectionStatus: (v) => set({ connectionStatus: v }),

  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),
  mobileFilePanelOpen: false,
  setMobileFilePanelOpen: (v) => set({ mobileFilePanelOpen: v }),
}))
