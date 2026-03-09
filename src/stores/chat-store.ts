import { create } from 'zustand'
import { streamChat } from '@/lib/chat-stream'
import { getAccessToken } from '@/lib/api-client'
import { assembleFromResponse } from '@/lib/chat/message-assembly'
import type { ChatAgentInfo, ChatMessage, ChatToolCall, ChatHistoryResponse, ChatAttachment, ChatContentBlock } from '@/types/chat'

interface ChatState {
  selectedAgent: ChatAgentInfo | null
  setSelectedAgent: (agent: ChatAgentInfo | null) => void

  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void

  // Completed messages (stable during streaming)
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void

  // Streaming message isolated from messages[] to avoid full-list re-renders
  streamingMessage: ChatMessage | null

  addUserMessage: (content: string, attachments?: ChatAttachment[]) => void
  appendAssistantContent: (content: string) => void
  appendAssistantImage: (imageUrl: string, mimeType?: string, alt?: string) => void
  appendThinking: (content: string) => void
  appendToolCall: (toolCall: ChatToolCall) => void
  setAssistantError: (error: string) => void

  isLoadingHistory: boolean
  setLoadingHistory: (v: boolean) => void

  isStreaming: boolean
  setStreaming: (v: boolean) => void
  abortController: AbortController | null

  sendMessage: (
    instanceId: string,
    agentId: string,
    message: string,
    sessionId?: string,
    attachments?: { name: string; content: string; mimeType: string; size: number; dataUrl: string }[],
  ) => Promise<void>

  clearMessages: () => void

  // Pending session-uploaded file paths (injected into next outgoing message)
  pendingFilePaths: Array<{ name: string; path: string }>
  addPendingFilePath: (name: string, path: string) => void
  clearPendingFilePaths: () => void

  connectionStatus: 'ok' | 'unreachable' | 'session-lost'
  setConnectionStatus: (v: 'ok' | 'unreachable' | 'session-lost') => void

  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void
}

async function syncFromHistory(
  activeSessionId: string,
  set: (partial: Partial<ChatState>) => void,
  opts?: { polling?: boolean },
) {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? ""
    const token = getAccessToken()
    const headers: Record<string, string> = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    const qs = opts?.polling ? '?polling=true' : ''
    const res = await fetch(`${apiUrl}/api/v1/chat/sessions/${activeSessionId}/history${qs}`, {
      credentials: 'include',
      headers,
    })
    if (!res.ok) return
    const json = await res.json()
    const data: ChatHistoryResponse = json?.data ?? json
    const assembled = assembleFromResponse(data)

    if (assembled.length > 0) {
      // Preserve user-uploaded attachments not returned by gateway history
      const existing = useChatStore.getState().messages
      const attachmentsByContent = new Map<string, ChatAttachment[]>()
      for (const msg of existing) {
        if (msg.role === 'user' && msg.attachments?.length) {
          attachmentsByContent.set(msg.content, msg.attachments)
        }
      }
      if (attachmentsByContent.size > 0) {
        for (const msg of assembled) {
          if (msg.role === 'user' && !msg.attachments?.length) {
            const att = attachmentsByContent.get(msg.content)
            if (att) msg.attachments = att
          }
        }
      }
      set({ messages: assembled })
    }

    if (data.connectionStatus) {
      set({ connectionStatus: data.connectionStatus })
    }
  } catch {
    // Silently fail
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

  isLoadingHistory: false,
  setLoadingHistory: (v) => set({ isLoadingHistory: v }),

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
      return { streamingMessage: { ...msg, thinking: (msg.thinking ?? '') + content } }
    })
  },

  appendToolCall: (toolCall) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
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

  sendMessage: async (instanceId, agentId, message, sessionId, attachments) => {
    const { addUserMessage } = get()
    let capturedSessionId = get().activeSessionId

    // Inject pending uploaded file paths into the gateway message
    const pendingPaths = get().pendingFilePaths
    let gatewayMessage = message
    if (pendingPaths.length > 0) {
      const pathList = pendingPaths.map((f) => f.path).join('\n')
      gatewayMessage = `[已上传文件，可通过以下路径直接读取：\n${pathList}]\n\n${message}`
      get().clearPendingFilePaths()
    }

    const uiAttachments: ChatAttachment[] | undefined = attachments?.map(a => ({
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      dataUrl: a.dataUrl,
    }))
    addUserMessage(message, uiAttachments)

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }
    set({ streamingMessage: assistantMsg })

    const controller = new AbortController()
    set({ isStreaming: true, abortController: controller })

    // Progress polling to show intermediate tool calls during streaming
    let syncing = false
    const PROGRESS_POLL_INTERVAL = 5_000
    const progressTimer = setInterval(() => {
      const sid = capturedSessionId || get().activeSessionId
      if (sid && get().isStreaming && !syncing) {
        syncing = true
        syncFromHistory(sid, set, { polling: true }).finally(() => { syncing = false })
      }
    }, PROGRESS_POLL_INTERVAL)

    try {
      const streamAttachments = attachments?.map(a => ({
        name: a.name,
        content: a.content,
        mimeType: a.mimeType,
      }))

      for await (const event of streamChat(
        { instanceId, agentId, message: gatewayMessage, sessionId, attachments: streamAttachments },
        controller.signal,
      )) {
        switch (event.type) {
          case 'session':
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
            get().appendToolCall({ toolName: event.toolName, toolInput: event.toolInput })
            break
          case 'tool_result':
            get().appendToolCall({ toolName: event.toolName, toolInput: null, toolOutput: event.toolOutput })
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

      const finalStreaming = get().streamingMessage
      if (finalStreaming) {
        set((s) => ({
          messages: [...s.messages, finalStreaming],
          streamingMessage: null,
          isStreaming: false,
          abortController: null,
        }))
      } else {
        set({ streamingMessage: null, isStreaming: false, abortController: null })
      }

      if (capturedSessionId && get().activeSessionId) {
        syncFromHistory(capturedSessionId, set)
      }
    }
  },

  clearMessages: () => {
    const { abortController } = get()
    if (abortController) abortController.abort()
    set({
      messages: [],
      streamingMessage: null,
      isStreaming: false,
      abortController: null,
      activeSessionId: null,
      pendingFilePaths: [],
      connectionStatus: 'ok',
    })
  },

  pendingFilePaths: [],
  addPendingFilePath: (name, path) =>
    set((s) => ({ pendingFilePaths: [...s.pendingFilePaths, { name, path }] })),
  clearPendingFilePaths: () => set({ pendingFilePaths: [] }),

  connectionStatus: 'ok',
  setConnectionStatus: (v) => set({ connectionStatus: v }),

  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
}))
