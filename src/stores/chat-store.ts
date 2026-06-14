import { create } from 'zustand'
import { streamChat } from '@/lib/chat-stream'
import { assembleFromResponse } from '@/lib/chat/message-assembly'
import { attachKbSourcesToLatestAssistant } from '@/lib/chat/kb-sources'
import type {
  ChatAgentInfo,
  ChatMessage,
  ChatToolCall,
  ChatHistoryResponse,
  ChatAttachment,
  ChatContentBlock,
  KbSourceRef,
} from '@/types/chat'

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

  // Messages queued while agent is running — for display only.
  // Removed once the user message appears in gateway history.
  queuedMessages: ChatMessage[]
  // Counter for queued runs awaiting response — drives polling independently of display.
  // Decremented when the assistant response arrives in history.
  pendingQueuedRuns: number

  // Streaming mutations (operate on streamingMessage, not messages[])
  addUserMessage: (content: string, attachments?: ChatAttachment[]) => void
  appendAssistantContent: (content: string) => void
  appendAssistantImage: (imageUrl: string, mimeType?: string, alt?: string) => void
  appendThinking: (content: string) => void
  appendToolCall: (toolCall: ChatToolCall) => void
  completeToolCall: (toolName: string, toolOutput: unknown) => void
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
    attachments?: {
      name: string
      content: string
      mimeType: string
      size: number
      dataUrl: string
    }[],
  ) => Promise<void>

  // Queue a message while agent is running (fire-and-forget to gateway)
  queueMessage: (
    message: string,
    attachments?: {
      name: string
      content: string
      mimeType: string
      size: number
      dataUrl: string
    }[],
  ) => void

  // Abort the running agent + SSE stream
  abortChat: () => void

  // Session management
  clearMessages: () => void

  // Gateway connection status
  connectionStatus: 'ok' | 'unreachable' | 'session-lost'
  setConnectionStatus: (v: 'ok' | 'unreachable' | 'session-lost') => void

  kbSources: KbSourceRef[]
  setKbSources: (sources: KbSourceRef[]) => void

  // PDF source preview — opened from KB source chips in assistant messages
  pdfPreview: {
    kbId: string
    docRowId: string
    docName?: string
    pageIndex?: number
  } | null
  openPdfPreview: (preview: NonNullable<ChatState['pdfPreview']>) => void
  closePdfPreview: () => void

  // Sidebar
  sidebarOpen: boolean
  setSidebarOpen: (v: boolean) => void

  // Mobile drawers (separate from desktop state — never read by desktop code)
  mobileSidebarOpen: boolean
  setMobileSidebarOpen: (v: boolean) => void
  mobileFilePanelOpen: boolean
  setMobileFilePanelOpen: (v: boolean) => void

  // Export mode
  exportMode: boolean
  setExportMode: (v: boolean) => void
  selectedExportIds: string[]
  toggleExportSelection: (id: string) => void
  selectAllExportMessages: () => void
}

/**
 * Lightweight poll: only reconcile queued messages without touching messages[].
 * Used by the progress timer once SSE has delivered tool events, to avoid
 * duplicating tool blocks (SSE's streamingMessage already shows them).
 */
async function reconcileQueuedFromHistory(activeSessionId: string) {
  // Early guard: skip fetch entirely if there's nothing to reconcile
  const { queuedMessages, pendingQueuedRuns } = useChatStore.getState()
  if (queuedMessages.length === 0 && pendingQueuedRuns === 0) return

  try {
    const url = `/api/v1/chat/sessions/${activeSessionId}/history?polling=true`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return
    const data: ChatHistoryResponse = await res.json()

    // Lightweight extraction — avoid full assembleFromResponse for polling.
    // We only need user message contents and whether assistants follow them.
    const historyMsgs: { role: string; content: string }[] = []
    for (const batch of data.snapshots ?? []) {
      for (const m of batch.messages) historyMsgs.push(m)
    }
    for (const m of data.currentMessages ?? []) historyMsgs.push(m)
    if (historyMsgs.length === 0) return

    const historyUserContents = new Set(
      historyMsgs.filter((m) => m.role === 'user').map((m) => m.content),
    )
    const displayRemaining = queuedMessages.filter((q) => !historyUserContents.has(q.content))
    let responsesArrived = 0
    for (const q of queuedMessages) {
      const idx = historyMsgs.findIndex((m) => m.role === 'user' && m.content === q.content)
      if (idx === -1) continue
      if (historyMsgs.slice(idx + 1).some((m) => m.role === 'assistant' && m.content)) {
        responsesArrived++
      }
    }
    // Fallback: queuedMessages empty but pendingQueuedRuns > 0
    if (responsesArrived === 0 && queuedMessages.length === 0 && pendingQueuedRuns > 0) {
      const lastUserIdx = [...historyMsgs].reverse().findIndex((m) => m.role === 'user')
      if (lastUserIdx !== -1) {
        const absIdx = historyMsgs.length - 1 - lastUserIdx
        if (historyMsgs.slice(absIdx + 1).some((m) => m.role === 'assistant' && m.content)) {
          responsesArrived = pendingQueuedRuns
        }
      }
    }
    const updates: Partial<ChatState> = {}
    if (displayRemaining.length !== queuedMessages.length) {
      updates.queuedMessages = displayRemaining
    }
    if (responsesArrived > 0) {
      const newPending = Math.max(0, pendingQueuedRuns - responsesArrived)
      updates.pendingQueuedRuns = newPending
      if (newPending === 0) updates.remoteStreaming = false
    }
    if (Object.keys(updates).length > 0) useChatStore.setState(updates)
  } catch {
    /* non-critical */
  }
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
): Promise<boolean> {
  try {
    const url = `/api/v1/chat/sessions/${activeSessionId}/history${opts?.polling ? '?polling=true' : ''}`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return false
    const data: ChatHistoryResponse = await res.json()
    const assembled = assembleFromResponse(data)

    // Don't overwrite existing messages with empty history — gateway may temporarily
    // return empty results mid-run (race condition between tool calls).
    if (assembled.length > 0) {
      const existing = useChatStore.getState().messages

      // Safety check: if this is a polling sync, verify the gateway snapshot
      // includes the latest local user message.  If not, the gateway hasn't
      // persisted it yet — skip replacement to prevent the message from
      // temporarily disappearing from the UI.
      if (opts?.polling) {
        const localUserContents = new Set(
          existing.filter((m) => m.role === 'user').map((m) => m.content),
        )
        const assembledUserContents = new Set(
          assembled.filter((m) => m.role === 'user').map((m) => m.content),
        )
        const allLocalInAssembled = [...localUserContents].every((c) =>
          assembledUserContents.has(c),
        )
        if (!allLocalInAssembled) return false
      }

      // Preserve user-uploaded attachments and contentBlocks: gateway chat.history
      // doesn't return image attachments/blocks in user messages, so we carry them
      // forward from existing local messages. Match by message text content.
      // Build ordered lookup: content → array of preserved data entries.
      // Multiple user messages with the same text each keep their own images.
      const preservedByContent = new Map<
        string,
        { attachments?: ChatAttachment[]; contentBlocks?: ChatContentBlock[] }[]
      >()
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
          if (!msg.contentBlocks?.length && saved.contentBlocks)
            msg.contentBlocks = saved.contentBlocks
        }
      }

      // Merge SSE-captured toolInput into assembled messages.
      // chat.history doesn't include tool call arguments — only results.
      // The SSE stream captures toolInput from agent:item events, so
      // carry it forward so the UI can show tool descriptions.
      // Match in REVERSE order with toolName validation.
      const sm = useChatStore.getState().streamingMessage
      if (sm?.toolCalls?.length) {
        const sseInputs = sm.toolCalls
          .filter((t) => t.toolInput != null && t.toolInput !== '')
          .map((t) => ({ name: t.toolName, input: t.toolInput as string }))
        let si = sseInputs.length - 1
        for (let mi = assembled.length - 1; mi >= 0 && si >= 0; mi--) {
          const msg = assembled[mi]
          if (msg.role !== 'assistant' || !msg.toolCalls?.length) continue
          for (let ti = msg.toolCalls.length - 1; ti >= 0 && si >= 0; ti--) {
            const tc = msg.toolCalls[ti]
            if (tc.toolInput != null) continue
            if (tc.toolName !== sseInputs[si].name) continue
            tc.toolInput = sseInputs[si].input
            si--
          }
        }
      }

      set({ messages: assembled })

      // Reconcile queued messages (two separate concerns):
      // 1. Display: remove from queuedMessages when user msg appears in history
      // 2. Polling: decrement pendingQueuedRuns when the RESPONSE arrives
      const { queuedMessages, pendingQueuedRuns } = useChatStore.getState()
      if (queuedMessages.length > 0 || pendingQueuedRuns > 0) {
        const historyUserContents = new Set(
          assembled.filter((m) => m.role === 'user').map((m) => m.content),
        )
        // Display: remove queued bubbles once they appear in history
        const displayRemaining = queuedMessages.filter((q) => !historyUserContents.has(q.content))
        // Polling: count how many queued messages got their response
        let responsesArrived = 0
        for (const q of queuedMessages) {
          const idx = assembled.findIndex((m) => m.role === 'user' && m.content === q.content)
          if (idx === -1) continue
          if (assembled.slice(idx + 1).some((m) => m.role === 'assistant' && m.content)) {
            responsesArrived++
          }
        }
        // Fallback: queuedMessages already cleared but pendingQueuedRuns > 0
        if (responsesArrived === 0 && queuedMessages.length === 0 && pendingQueuedRuns > 0) {
          const lastUserIdx = assembled.findLastIndex((m) => m.role === 'user')
          if (
            lastUserIdx !== -1 &&
            assembled.slice(lastUserIdx + 1).some((m) => m.role === 'assistant' && m.content)
          ) {
            responsesArrived = pendingQueuedRuns
          }
        }
        const updates: Partial<ChatState> = {}
        if (displayRemaining.length !== queuedMessages.length) {
          updates.queuedMessages = displayRemaining
        }
        if (responsesArrived > 0) {
          const newPending = Math.max(0, pendingQueuedRuns - responsesArrived)
          updates.pendingQueuedRuns = newPending
          if (newPending === 0) {
            updates.remoteStreaming = false
          }
        }
        if (Object.keys(updates).length > 0) set(updates)
      }
    }
    return false // empty assembled — gateway hasn't caught up yet
  } catch {
    // Silently fail — sync is a non-critical UI enhancement
    return false
  }
}

export const useChatStore = create<ChatState>((set, get) => ({
  selectedAgent: null,
  setSelectedAgent: (agent) =>
    set((s) => ({
      selectedAgent: agent,
      ...(agent && agent !== s.selectedAgent && s.exportMode
        ? { exportMode: false, selectedExportIds: [] }
        : {}),
    })),

  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),

  messages: [],
  streamingMessage: null,
  queuedMessages: [],
  pendingQueuedRuns: 0,

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
      const reclassifiedThinking = msg.content
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

  completeToolCall: (toolName, toolOutput) => {
    set((s) => {
      const msg = s.streamingMessage
      if (!msg) return {}
      const tcs = [...(msg.toolCalls ?? [])]
      // Find the latest matching entry without output and update it in-place.
      // This avoids creating a duplicate entry and avoids re-triggering the
      // content→thinking reclassification that appendToolCall performs.
      for (let i = tcs.length - 1; i >= 0; i--) {
        if (tcs[i].toolName === toolName && tcs[i].toolOutput == null) {
          tcs[i] = { ...tcs[i], toolOutput }
          return { streamingMessage: { ...msg, toolCalls: tcs } }
        }
      }
      return {}
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
    const uiAttachments: ChatAttachment[] | undefined = attachments?.map((a) => ({
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
    set({ streamingMessage: assistantMsg, kbSources: [] })

    // 3. Set streaming state
    const controller = new AbortController()
    set({ isStreaming: true, abortController: controller })

    // 3b. Progress polling — lightweight: only reconcile queued messages.
    // SSE now delivers all content (text, thinking, tool_call, tool_result)
    // in real-time via stream=item + stream=command_output (OpenClaw 2026.4+).
    // messages[] stays untouched during streaming — only streamingMessage
    // carries live content.  The final syncFromHistory at stream-end replaces
    // messages[] with the authoritative gateway snapshot.
    //
    // Don't start polling until the gateway confirms it has received the
    // user message.  Otherwise history might not include the latest message.
    let syncing = false
    let gatewayConfirmed = false
    const streamStartedAt = Date.now()
    const PROGRESS_POLL_INTERVAL = 5_000
    const CONFIRMED_FALLBACK_MS = 15_000
    const progressTimer = setInterval(() => {
      const sid = capturedSessionId || get().activeSessionId
      const canPoll = gatewayConfirmed || Date.now() - streamStartedAt > CONFIRMED_FALLBACK_MS
      if (sid && get().isStreaming && !syncing && canPoll) {
        syncing = true
        reconcileQueuedFromHistory(sid).finally(() => {
          syncing = false
        })
      }
    }, PROGRESS_POLL_INTERVAL)

    try {
      // 4. Stream events
      // Build attachments payload (base64 only, no data URL prefix)
      const streamAttachments = attachments?.map((a) => ({
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
          case 'confirmed':
            // Server confirms chat.send was dispatched to gateway —
            // safe to start progress polling for thinking/tool calls.
            gatewayConfirmed = true
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
            get().completeToolCall(event.toolName, event.toolOutput)
            break
          case 'image':
            get().appendAssistantImage(event.imageUrl, event.mimeType, event.alt)
            break
          case 'kb_sources':
            set((s) => ({
              kbSources: event.sources,
              streamingMessage: s.streamingMessage
                ? { ...s.streamingMessage, kbSources: event.sources }
                : s.streamingMessage,
            }))
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

      const hasQueued = get().pendingQueuedRuns > 0

      // 5. Sync with full history FIRST (primary path — contains complete data with tool calls).
      // Only merge streamingMessage as a fallback if sync fails (gateway unreachable / empty).
      let historySynced = false
      if (capturedSessionId && get().activeSessionId) {
        historySynced = await syncFromHistory(capturedSessionId, set)
      }

      const finalStreaming = get().streamingMessage
      const finalKbSources = finalStreaming?.kbSources ?? []
      if (historySynced) {
        set((s) => ({
          messages: attachKbSourcesToLatestAssistant(s.messages, finalKbSources),
          streamingMessage: null,
          isStreaming: false,
          remoteStreaming: hasQueued,
          abortController: null,
        }))
      } else if (finalStreaming) {
        set((s) => ({
          messages: [...s.messages, finalStreaming],
          streamingMessage: null,
          isStreaming: false,
          remoteStreaming: hasQueued,
          abortController: null,
        }))
      } else {
        set({
          streamingMessage: null,
          isStreaming: false,
          remoteStreaming: hasQueued,
          abortController: null,
        })
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
      } catch {
        /* non-fatal */
      }
    }
  },

  queueMessage: (message, attachments) => {
    const { selectedAgent } = get()
    if (!selectedAgent) return

    // Add to queuedMessages (NOT messages[]) — survives syncFromHistory overwrites
    const uiAttachments: ChatAttachment[] | undefined = attachments?.map((a) => ({
      name: a.name,
      mimeType: a.mimeType,
      size: a.size,
      dataUrl: a.dataUrl,
    }))
    const queuedMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
      createdAt: new Date().toISOString(),
      ...(uiAttachments ? { attachments: uiAttachments } : {}),
    }
    set((s) => ({
      queuedMessages: [...s.queuedMessages, queuedMsg],
      pendingQueuedRuns: s.pendingQueuedRuns + 1,
    }))

    // Fire-and-forget: send to gateway queue via lightweight endpoint
    const queueAttachments = attachments?.map((a) => ({
      fileName: a.name,
      content: a.content,
      mimeType: a.mimeType,
    }))
    fetch('/api/v1/chat/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instanceId: selectedAgent.instanceId,
        agentId: selectedAgent.agentId,
        message,
        ...(queueAttachments?.length ? { attachments: queueAttachments } : {}),
      }),
      credentials: 'include',
    }).catch(() => {})
  },

  abortChat: () => {
    const { abortController, selectedAgent } = get()
    // 1. Immediately abort the SSE fetch for instant UI feedback
    if (abortController) abortController.abort()
    // 2. Fire-and-forget: tell the gateway to abort the agent run
    if (selectedAgent) {
      fetch('/api/v1/chat/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceId: selectedAgent.instanceId,
          agentId: selectedAgent.agentId,
        }),
        credentials: 'include',
      }).catch(() => {})
    }
  },

  clearMessages: () => {
    const { abortController } = get()
    if (abortController) abortController.abort()
    set({
      messages: [],
      streamingMessage: null,
      queuedMessages: [],
      pendingQueuedRuns: 0,
      isStreaming: false,
      abortController: null,
      activeSessionId: null,
      connectionStatus: 'ok',
      remoteStreaming: false,
      kbSources: [],
    })
  },

  connectionStatus: 'ok',
  setConnectionStatus: (v) => set({ connectionStatus: v }),

  kbSources: [],
  setKbSources: (sources) => set({ kbSources: sources }),

  pdfPreview: null,
  openPdfPreview: (preview) => set({ pdfPreview: preview }),
  closePdfPreview: () => set({ pdfPreview: null }),

  sidebarOpen: true,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),

  mobileSidebarOpen: false,
  setMobileSidebarOpen: (v) => set({ mobileSidebarOpen: v }),
  mobileFilePanelOpen: false,
  setMobileFilePanelOpen: (v) => set({ mobileFilePanelOpen: v }),

  exportMode: false,
  setExportMode: (v) => set({ exportMode: v, selectedExportIds: v ? get().selectedExportIds : [] }),
  selectedExportIds: [],
  toggleExportSelection: (id) =>
    set((s) => ({
      selectedExportIds: s.selectedExportIds.includes(id)
        ? s.selectedExportIds.filter((x) => x !== id)
        : [...s.selectedExportIds, id],
    })),
  selectAllExportMessages: () =>
    set((s) => {
      const eligible = s.messages
        .filter((m) => {
          if (m.content.startsWith('__separator__:')) return false
          if (m.role === 'assistant' && !m.content && !m.error && (m.thinking || (m.toolCalls?.length ?? 0) > 0)) return false
          return true
        })
        .map((m) => m.id)
      // Default: select only the latest 2 messages
      const ids = eligible.slice(-2)
      return { selectedExportIds: ids }
    }),
}))
