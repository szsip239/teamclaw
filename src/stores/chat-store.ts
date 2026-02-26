import { create } from 'zustand'
import { streamChat } from '@/lib/chat-stream'
import type { ChatAgentInfo, ChatMessage, ChatToolCall, ChatHistoryResponse, ChatAttachment, ChatContentBlock } from '@/types/chat'

interface ChatState {
  // Selected agent
  selectedAgent: ChatAgentInfo | null
  setSelectedAgent: (agent: ChatAgentInfo | null) => void

  // Active session tracking
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void

  // Messages for current conversation
  messages: ChatMessage[]
  addUserMessage: (content: string, attachments?: ChatAttachment[]) => void
  appendAssistantContent: (content: string) => void
  appendAssistantImage: (imageUrl: string, mimeType?: string, alt?: string) => void
  appendThinking: (content: string) => void
  appendToolCall: (toolCall: ChatToolCall) => void
  setAssistantError: (error: string) => void
  completeAssistantMessage: () => void

  // History loading
  isLoadingHistory: boolean
  setLoadingHistory: (v: boolean) => void
  setMessages: (messages: ChatMessage[]) => void

  // Streaming state
  isStreaming: boolean
  setStreaming: (v: boolean) => void
  abortController: AbortController | null

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

  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
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
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
) {
  try {
    const res = await fetch(`/api/v1/chat/sessions/${activeSessionId}/history`, {
      credentials: 'include',
    })
    if (!res.ok) return
    const data: ChatHistoryResponse = await res.json()

    const snapshots = data.snapshots ?? []
    const currentMessages = data.currentMessages ?? []
    const assembled: ChatMessage[] = []

    // Rebuild: snapshots + separators + currentMessages
    for (let i = 0; i < snapshots.length; i++) {
      assembled.push(...snapshots[i].messages)
      const isLastBatch = i === snapshots.length - 1
      const hasMoreContent = !isLastBatch || (data.isActive && currentMessages.length > 0)
      if (hasMoreContent) {
        assembled.push({
          id: `sep-${snapshots[i].batchId}`,
          role: 'assistant' as const,
          content: `__separator__:context-reset`,
          createdAt: new Date().toISOString(),
        })
      }
    }

    if (data.isActive && currentMessages.length > 0) {
      assembled.push(...currentMessages)
    }

    set(() => ({ messages: assembled }))
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

  isLoadingHistory: false,
  setLoadingHistory: (v) => set({ isLoadingHistory: v }),
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
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        const blocks: ChatContentBlock[] = [...(last.contentBlocks ?? [])]
        blocks.push({ type: 'image', imageUrl, mimeType, alt })
        msgs[msgs.length - 1] = { ...last, contentBlocks: blocks }
      }
      return { messages: msgs }
    })
  },

  appendAssistantContent: (content) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, content: last.content + content }
      }
      return { messages: msgs }
    })
  },

  appendThinking: (content) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = {
          ...last,
          thinking: (last.thinking ?? '') + content,
        }
      }
      return { messages: msgs }
    })
  },

  appendToolCall: (toolCall) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        // When a tool call arrives, any accumulated content is intermediate
        // narration (e.g. "Let me calculate..."), not the final answer.
        // Move it into thinking so it renders in the collapsible block.
        const reclassifiedThinking =
          last.content
            ? last.content + (last.thinking ? '\n\n' + last.thinking : '')
            : last.thinking
        msgs[msgs.length - 1] = {
          ...last,
          content: '',
          ...(reclassifiedThinking ? { thinking: reclassifiedThinking } : {}),
          toolCalls: [...(last.toolCalls ?? []), toolCall],
        }
      }
      return { messages: msgs }
    })
  },

  setAssistantError: (error) => {
    set((s) => {
      const msgs = [...s.messages]
      const last = msgs[msgs.length - 1]
      if (last?.role === 'assistant') {
        msgs[msgs.length - 1] = { ...last, error }
      }
      return { messages: msgs }
    })
  },

  completeAssistantMessage: () => {
    // No-op marker — streaming is done
  },

  isStreaming: false,
  setStreaming: (v) => set({ isStreaming: v }),
  abortController: null,

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

    // 2. Create assistant placeholder
    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }
    set((s) => ({ messages: [...s.messages, assistantMsg] }))

    // 3. Set streaming state
    const controller = new AbortController()
    set({ isStreaming: true, abortController: controller })

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
            get().completeAssistantMessage()
            break
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        get().setAssistantError((err as Error).message || '发送消息失败')
      }
    } finally {
      set({ isStreaming: false, abortController: null })

      // 5. Sync with full history (gateway omits thinking + tool events during streaming)
      // Use captured ID to avoid reading a stale/changed activeSessionId
      if (capturedSessionId) {
        syncFromHistory(capturedSessionId, set)
      }
    }
  },

  clearMessages: () => {
    const { abortController } = get()
    if (abortController) abortController.abort()
    set({ messages: [], isStreaming: false, abortController: null, activeSessionId: null })
  },

  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
