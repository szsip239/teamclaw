'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot,
  FileSearch,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  StopCircle,
  Trash2,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ChatTextBlock } from '@/components/chat/chat-text-block'
import { KbAnswerAssets } from './kb-answer-assets'
import { KbImageLightbox } from './kb-image-lightbox'
import { KbDocumentOriginalSheet } from './kb-document-original-sheet'
import { KbConversationSidebar } from './kb-conversation-sidebar'
import { streamKbQuery } from '@/lib/knowledge-base/query-stream'
import {
  appendMessage,
  createConversation,
  deleteConversation,
  deleteMessage,
  listConversations,
  loadConversation,
  renameConversation,
  type ConversationSummary,
  type PersistedMessage,
} from '@/lib/knowledge-base/conversations-client'
import {
  linkifyPageCitations,
  parsePageCitationHref,
  resolveCitationDoc,
} from '@/lib/knowledge-base/page-citations'
import { cn } from '@/lib/utils'
import { useT } from '@/stores/language-store'
import type { KnowledgeDocumentInfo, ScoredNode } from '@/types/knowledge-base'

// Hoisted so ChatTextBlock's memo isn't defeated by a fresh function on
// every render — re-rendering causes ReactMarkdown to rebuild the table
// wrapper and lose the inner scroll position.
const isPageCitationHref = (href: string) => href.startsWith('kb-page:')

interface KbQaTabProps {
  kbId: string
  kbName: string
  documents: KnowledgeDocumentInfo[]
}

interface RetrievalGroups {
  text_results: ScoredNode[]
  image_results: ScoredNode[]
  table_results: ScoredNode[]
}

interface QaMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  pending?: boolean
  error?: boolean
  stopped?: boolean
  stage?: string
  progressDetail?: string
  reasoning?: string
  answerAssets?: ScoredNode[]
  answerSources?: ScoredNode[]
  retrievalGroups?: RetrievalGroups
}

interface SourcePreviewState {
  doc: KnowledgeDocumentInfo
  page: number
}

const THINKING_TOGGLE_KEY = 'teamclaw:kb-qa-show-thinking'
const AUTOSCROLL_PIXEL_THRESHOLD = 80

function rehydrateMessage(persisted: PersistedMessage): QaMessage {
  const groups = persisted.retrievalGroups as RetrievalGroups | null
  return {
    id: persisted.id,
    role: persisted.role,
    content: persisted.content,
    reasoning: persisted.reasoning ?? '',
    createdAt: persisted.createdAt,
    pending: false,
    error: persisted.error,
    stopped: persisted.stopped,
    stage: persisted.stage ?? undefined,
    answerSources: (persisted.answerSources as ScoredNode[]) ?? [],
    answerAssets: (persisted.answerAssets as ScoredNode[]) ?? [],
    retrievalGroups: groups ?? undefined,
  }
}

/**
 * Normalize a source from the RAG service SSE shape (text/score/
 * source_type/metadata) into the ScoredNode shape the UI expects
 * (kind/doc_id/page_no flat at the top). Without this both the inline
 * page-citation linker and the bottom sources panel fail to resolve a
 * doc_id and silently render plain text instead of clickable chips.
 */
function normalizeSource(raw: unknown): ScoredNode {
  const r = (raw ?? {}) as Record<string, unknown>
  const metadata = (r.metadata as Record<string, unknown> | undefined) ?? {}
  const docId = (r.doc_id as string) ?? (metadata.doc_id as string) ?? ''
  const pageIndex = (r.page_no as number | undefined) ?? (metadata.page_index as number | undefined)
  const sourceType =
    (r.kind as string) ??
    (r.source_type === 'table' ? 'table' : (r.source_type as string)) ??
    'text'
  return {
    kind: sourceType,
    score: Number(r.score) || 0,
    doc_id: docId,
    page_no: pageIndex && pageIndex > 0 ? pageIndex : null,
    page_label: (metadata.page_label as string) ?? '',
    source_path: (metadata.source_path as string) ?? '',
    summary: (r.summary as string) ?? '',
    text: (r.text as string) ?? '',
    snippet: (r.snippet as string) ?? '',
    block_id: (metadata.block_id as string) ?? undefined,
    image_id: (metadata.image_id as string) ?? undefined,
    image_path: (metadata.image_path as string) ?? undefined,
    image_url: (metadata.image_url as string) ?? undefined,
    table_id: (metadata.table_id as string) ?? undefined,
    caption: (metadata.caption as string) ?? undefined,
  } as ScoredNode
}

function normalizeSources(raw: unknown): ScoredNode[] {
  if (!Array.isArray(raw)) return []
  return raw.map(normalizeSource)
}

export function KbQaTab({ kbId, kbName, documents }: KbQaTabProps) {
  const t = useT()
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<QaMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [showThinking, setShowThinking] = useState(() => {
    if (typeof window === 'undefined') return true
    const stored = window.localStorage.getItem(THINKING_TOGGLE_KEY)
    return stored === null ? true : stored === '1'
  })
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)
  const [lightboxTitle, setLightboxTitle] = useState('')
  const [sourcePreview, setSourcePreview] = useState<SourcePreviewState | null>(null)
  // Per-message thinking-panel open state, so users can collapse a panel
  // and have it stay collapsed even as more messages stream in below.
  const [thinkingOpen, setThinkingOpen] = useState<Record<string, boolean>>({})
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [convLoading, setConvLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  // Tracks whether the user is reading from the bottom (so we keep
  // auto-scrolling) or has scrolled up to look at something (so we
  // stop hijacking their scroll position).
  // Defaults to false so loading a historical conversation lands at the
  // top instead of jumping to the latest reply — flipped to true when
  // the user sends a new message or scrolls to the bottom themselves.
  const stickToBottomRef = useRef(false)
  const readyDocuments = useMemo(
    () => documents.filter((doc) => doc.status === 'SUCCEEDED'),
    [documents],
  )
  const canAsk = readyDocuments.length > 0
  const hasMessages = messages.length > 0
  const pendingAssistant = useMemo(
    () =>
      [...messages].reverse().find((message) => message.role === 'assistant' && message.pending),
    [messages],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(THINKING_TOGGLE_KEY, showThinking ? '1' : '0')
  }, [showThinking])

  // Initial conversation load: fetch the user's existing conversations
  // for this KB; pick the most recent or create a new empty one.
  useEffect(() => {
    let cancelled = false
    setConvLoading(true)
    listConversations(kbId)
      .then(async (list) => {
        if (cancelled) return
        setConversations(list)
        if (list.length === 0) {
          // Lazy-create on first message instead — no point in spawning an
          // empty conversation before the user actually asks anything.
          setActiveConvId(null)
          setMessages([])
        } else {
          const first = list[0]
          setActiveConvId(first.id)
          const detail = await loadConversation(kbId, first.id)
          if (cancelled) return
          setMessages(detail.messages.map(rehydrateMessage))
        }
      })
      .catch(() => {
        if (cancelled) return
        setConversations([])
        setActiveConvId(null)
      })
      .finally(() => {
        if (!cancelled) setConvLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [kbId])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const handleScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight
      stickToBottomRef.current = distance < AUTOSCROLL_PIXEL_THRESHOLD
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  // Only auto-scroll while the user is parked at the bottom. If they've
  // scrolled up to read, we leave their position alone.
  useEffect(() => {
    if (!stickToBottomRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const updateAssistant = useCallback((id: string, updater: (message: QaMessage) => QaMessage) => {
    setMessages((prev) => prev.map((message) => (message.id === id ? updater(message) : message)))
  }, [])

  const findDocumentForSource = useCallback(
    (node: ScoredNode) =>
      documents.find((doc) => doc.docId === node.doc_id || doc.id === node.doc_id) ?? null,
    [documents],
  )

  const openSource = useCallback(
    (node: ScoredNode) => {
      const doc = findDocumentForSource(node)
      if (!doc) return
      setSourcePreview({ doc, page: node.page_no && node.page_no > 0 ? node.page_no : 1 })
    },
    [findDocumentForSource],
  )

  // Triggered when a page chip inside an assistant answer is clicked.
  // docId comes from the linkifier; we look up the matching document the
  // same way openSource does.
  const handlePageCitation = useCallback(
    (docId: string, page: number) => {
      const doc = documents.find((d) => d.docId === docId || d.id === docId)
      if (!doc) return
      setSourcePreview({ doc, page: page > 0 ? page : 1 })
    },
    [documents],
  )

  // Shared streaming engine for both new questions and regenerations.
  // Caller is responsible for:
  //  - putting the placeholder pending assistant message into state
  //  - making sure `convId` is set (and the user message is persisted)
  // This function just drives the SSE loop, mutates the placeholder via
  // updateAssistant, and after the stream finishes persists the assistant
  // turn to the backend and bumps the sidebar entry.
  const runAssistantStream = useCallback(
    async (params: {
      question: string
      assistantId: string
      convId: string
      sidebarBump: number // +2 for new round, +1 for regenerate (delete+create)
    }) => {
      const { question: q, assistantId, convId, sidebarBump } = params
      const controller = new AbortController()
      abortRef.current = controller
      setIsStreaming(true)

      // Mirror the assistant message in plain locals as the stream runs.
      // We persist from these at the end instead of trying to read React
      // state — setState updaters in async paths are not guaranteed to
      // execute before the next line under React 18 batching, so the
      // earlier `setMessages(prev => { snap = ...; return prev })` trick
      // routinely produced `snap === undefined` and silently skipped
      // persisting the assistant turn.
      let finalContent = ''
      let finalReasoning = ''
      let finalStage: string | undefined
      let finalAssets: ScoredNode[] = []
      let finalSources: ScoredNode[] = []
      let finalGroups: RetrievalGroups | undefined
      let finalError = false
      let finalStopped = false
      let finalized = false

      try {
        for await (const event of streamKbQuery(
          kbId,
          q,
          true,
          8,
          showThinking,
          controller.signal,
        )) {
          if (event.type === 'progress') {
            updateAssistant(assistantId, (message) => ({
              ...message,
              stage: (event.data.stage as string) || message.stage,
              progressDetail: (event.data.detail as string) || message.progressDetail,
            }))
            continue
          }

          if (event.type === 'retrieval') {
            const assets = normalizeSources(event.data.answer_assets)
            const sources = normalizeSources(event.data.answer_sources)
            const allSources = normalizeSources(event.data.sources)
            const groups: RetrievalGroups = {
              text_results: allSources.filter((source) => source.kind === 'text'),
              image_results: allSources.filter((source) => source.kind === 'image'),
              table_results: allSources.filter((source) => source.kind === 'table'),
            }
            finalAssets = assets
            finalSources = sources
            finalGroups = groups
            updateAssistant(assistantId, (message) => ({
              ...message,
              stage: t('kb.qaStatusContext'),
              progressDetail: t('kb.qaProgressContext', { n: allSources.length }),
              answerAssets: assets,
              answerSources: sources,
              retrievalGroups: groups,
            }))
            continue
          }

          if (event.type === 'reasoning') {
            const delta = (event.data.delta as string) ?? ''
            finalReasoning += delta
            updateAssistant(assistantId, (message) => ({
              ...message,
              stage: t('kb.qaStatusThinking'),
              progressDetail: t('kb.qaProgressThinking'),
              reasoning: `${message.reasoning ?? ''}${delta}`,
            }))
            continue
          }

          if (event.type === 'chunk') {
            const text = (event.data.text as string) ?? ''
            finalContent += text
            updateAssistant(assistantId, (message) => ({
              ...message,
              stage: t('kb.qaStatusGenerating'),
              progressDetail: t('kb.qaProgressGenerating'),
              content: `${message.content}${text}`,
            }))
            continue
          }

          if (event.type === 'error') {
            const msg = (event.data.message as string) || t('operationFailed')
            finalContent = msg
            finalError = true
            finalStage = t('kb.qaStatusFailed')
            finalized = true
            updateAssistant(assistantId, (message) => ({
              ...message,
              pending: false,
              error: true,
              stage: t('kb.qaStatusFailed'),
              content: msg,
            }))
            break
          }

          if (event.type === 'done') {
            const doneAssets = normalizeSources(event.data.answer_assets)
            const doneSources = normalizeSources(event.data.answer_sources)
            const doneReasoning = ((event.data.reasoning as string) || finalReasoning || '').trim()
            if (doneAssets.length > 0) finalAssets = doneAssets
            if (doneSources.length > 0) finalSources = doneSources
            finalReasoning = doneReasoning
            finalStage = t('kb.qaStatusCompleted')
            finalized = true
            updateAssistant(assistantId, (message) => ({
              ...message,
              pending: false,
              stage: t('kb.qaStatusCompleted'),
              reasoning: doneReasoning,
              answerAssets: doneAssets.length > 0 ? doneAssets : message.answerAssets,
              answerSources: doneSources.length > 0 ? doneSources : message.answerSources,
            }))
            break
          }
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          const stoppedText = finalContent || t('kb.qaStopped')
          finalContent = stoppedText
          finalStopped = true
          finalStage = t('kb.qaStatusStopped')
          finalized = true
          updateAssistant(assistantId, (message) => ({
            ...message,
            pending: false,
            stopped: true,
            stage: t('kb.qaStatusStopped'),
            progressDetail: t('kb.qaStopped'),
            content: stoppedText,
          }))
        } else {
          const msg = (err as Error).message || t('operationFailed')
          finalContent = msg
          finalError = true
          finalStage = t('kb.qaStatusFailed')
          finalized = true
          updateAssistant(assistantId, (message) => ({
            ...message,
            pending: false,
            error: true,
            stage: t('kb.qaStatusFailed'),
            content: msg,
          }))
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null

        if (finalized) {
          appendMessage(kbId, convId, {
            role: 'assistant',
            content: finalContent,
            reasoning: finalReasoning || null,
            stage: finalStage ?? null,
            error: finalError,
            stopped: finalStopped,
            answerSources: finalSources,
            answerAssets: finalAssets,
            retrievalGroups: finalGroups ?? null,
          })
            .then((result) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, id: result.id } : m)),
              )
            })
            .catch(() => {
              /* swallow */
            })

          setConversations((prevList) => {
            const idx = prevList.findIndex((c) => c.id === convId)
            if (idx < 0) return prevList
            const updated = {
              ...prevList[idx],
              updatedAt: new Date().toISOString(),
              messageCount: prevList[idx].messageCount + sidebarBump,
            }
            return [updated, ...prevList.slice(0, idx), ...prevList.slice(idx + 1)]
          })
        }
      }
    },
    [kbId, showThinking, t, updateAssistant],
  )

  const handleSubmit = useCallback(async () => {
    const q = question.trim()
    if (!q || isStreaming || !canAsk) return

    // Lazy-create a conversation on the first message so empty
    // sessions don't pollute the sidebar. The auto-title flag below
    // lets the backend derive a title from this very first question.
    let convId = activeConvId
    let isFirstMessageInConv = false
    if (!convId) {
      try {
        const conv = await createConversation(kbId)
        convId = conv.id
        setActiveConvId(conv.id)
        setConversations((prev) => [conv, ...prev])
        isFirstMessageInConv = true
      } catch {
        return
      }
    } else {
      isFirstMessageInConv = messages.length === 0
    }

    const now = new Date().toISOString()
    const userMessage: QaMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      createdAt: now,
    }
    const assistantId = `assistant-${Date.now()}`
    const assistantMessage: QaMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      reasoning: '',
      createdAt: now,
      pending: true,
      stage: t('kb.qaStatusRetrieving'),
      progressDetail: t('kb.qaProgressRetrieving'),
      answerAssets: [],
      answerSources: [],
    }

    // User is actively chatting — re-enable stick-to-bottom so the new
    // user bubble + streaming reply scroll into view regardless of where
    // they were reading before.
    stickToBottomRef.current = true
    setMessages((prev) => [...prev, userMessage, assistantMessage])
    setQuestion('')

    appendMessage(kbId, convId, {
      role: 'user',
      content: q,
      autoTitle: isFirstMessageInConv,
    })
      .then((result) => {
        // Replace the placeholder id with the server-assigned cuid so that
        // subsequent delete operations can locate the row in the database.
        setMessages((prev) =>
          prev.map((m) => (m.id === userMessage.id ? { ...m, id: result.id } : m)),
        )
      })
      .catch(() => {
        /* swallow */
      })

    await runAssistantStream({
      question: q,
      assistantId,
      convId,
      sidebarBump: 2,
    })
  }, [activeConvId, canAsk, isStreaming, kbId, messages.length, question, runAssistantStream, t])

  function handleAbort() {
    abortRef.current?.abort()
  }

  async function handleSelectConversation(id: string) {
    if (id === activeConvId || isStreaming) return
    setActiveConvId(id)
    setMessages([])
    setThinkingOpen({})
    try {
      const detail = await loadConversation(kbId, id)
      setMessages(detail.messages.map(rehydrateMessage))
    } catch {
      /* If load fails, leave empty — user can retry by reselecting. */
    }
  }

  async function handleCreateConversation() {
    if (isStreaming) return
    try {
      const conv = await createConversation(kbId)
      setConversations((prev) => [conv, ...prev])
      setActiveConvId(conv.id)
      setMessages([])
      setThinkingOpen({})
    } catch {
      /* swallow — user can retry */
    }
  }

  async function handleRenameConversation(id: string, currentTitle: string) {
    const next = window.prompt(t('kb.qaRenamePrompt'), currentTitle)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed || trimmed === currentTitle) return
    try {
      await renameConversation(kbId, id, trimmed)
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: trimmed } : c)))
    } catch {
      /* swallow */
    }
  }

  async function handleDeleteConversation(id: string) {
    if (!window.confirm(t('kb.qaConfirmDelete'))) return
    try {
      await deleteConversation(kbId, id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === activeConvId) {
        setActiveConvId(null)
        setMessages([])
        setThinkingOpen({})
      }
    } catch {
      /* swallow */
    }
  }

  function toggleThinking(messageId: string, nextOpen: boolean) {
    setThinkingOpen((prev) => ({ ...prev, [messageId]: nextOpen }))
  }

  // Remove the assistant answer AND its preceding user question from
  // both the UI and the backend. "Delete this round" means delete the
  // whole exchange — what you asked + what the assistant replied.
  async function handleDeleteRound(messageId: string) {
    if (isStreaming || !activeConvId) return
    const idx = messages.findIndex((m) => m.id === messageId)
    if (idx < 0) return
    const target = messages[idx]
    if (target.role !== 'assistant') return

    let pairIdx = -1
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        pairIdx = i
        break
      }
    }
    const toRemove = pairIdx >= 0 ? [messageId, messages[pairIdx].id] : [messageId]

    if (!window.confirm(t('kb.qaConfirmDeleteRound'))) return

    setMessages((prev) => prev.filter((m) => !toRemove.includes(m.id)))
    setThinkingOpen((prev) => {
      const next = { ...prev }
      for (const id of toRemove) delete next[id]
      return next
    })

    for (const id of toRemove) {
      // Placeholder ids (user-*/assistant-*) mean the message was never
      // persisted to the backend — skip the API call.
      if (id.startsWith('assistant-')) continue
      try {
        await deleteMessage(kbId, activeConvId, id)
      } catch {
        /* swallow */
      }
    }

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConvId
          ? { ...c, messageCount: Math.max(0, c.messageCount - toRemove.length) }
          : c,
      ),
    )
  }

  // Re-run a question. Finds the preceding user message, removes the old
  // assistant answer (UI + DB), inserts a fresh pending placeholder in the
  // same position, and re-streams.
  async function handleRegenerate(assistantMessageId: string) {
    if (isStreaming || !activeConvId) return
    const idx = messages.findIndex((m) => m.id === assistantMessageId)
    if (idx < 0) return
    const target = messages[idx]
    if (target.role !== 'assistant') return
    let userIdx = -1
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userIdx = i
        break
      }
    }
    if (userIdx < 0) return
    const userMessage = messages[userIdx]

    // Drop the old assistant message server-side first so we don't keep a
    // stale row around if streaming fails partway.
    if (!target.id.startsWith('assistant-')) {
      try {
        await deleteMessage(kbId, activeConvId, target.id)
      } catch {
        /* keep going — UI replace still useful */
      }
    }

    const replacementId = `assistant-${Date.now()}`
    const placeholder: QaMessage = {
      id: replacementId,
      role: 'assistant',
      content: '',
      reasoning: '',
      createdAt: new Date().toISOString(),
      pending: true,
      stage: t('kb.qaStatusRetrieving'),
      progressDetail: t('kb.qaProgressRetrieving'),
      answerAssets: [],
      answerSources: [],
    }
    setMessages((prev) => {
      const next = [...prev]
      next.splice(idx, 1, placeholder)
      return next
    })
    setThinkingOpen((prev) => {
      const next = { ...prev }
      delete next[assistantMessageId]
      return next
    })

    await runAssistantStream({
      question: userMessage.content,
      assistantId: replacementId,
      convId: activeConvId,
      // Regenerate: one delete (-1) + one append (+1) = net 0 change to
      // messageCount, but the conversation still moves to the top of
      // the sidebar because we bump updatedAt inside runAssistantStream.
      sidebarBump: 0,
    })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Ignore Enter during IME composition (中文输入法选字阶段).
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function openLightbox(imageUrl: string, title: string) {
    setLightboxImage(imageUrl)
    setLightboxTitle(title)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <KbConversationSidebar
        kbName={kbName}
        conversations={conversations}
        activeId={activeConvId}
        isLoading={convLoading}
        onSelect={handleSelectConversation}
        onCreate={handleCreateConversation}
        onRename={handleRenameConversation}
        onDelete={handleDeleteConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-muted/10">
        {isStreaming && (
          <div className="flex justify-end border-b bg-background/85 px-4 py-2">
            <Badge variant="outline" className="gap-1.5 rounded-md text-[11px] font-medium">
              <Loader2 className="size-3 animate-spin" />
              {pendingAssistant?.stage || t('kb.qaStatusGenerating')}
            </Badge>
          </div>
        )}

        <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {!hasMessages ? (
            <div className="flex h-full min-h-[360px] items-center justify-center p-8 text-center">
              <div className="w-full max-w-md">
                <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-background text-primary shadow-sm">
                  <FileSearch className="size-7" />
                </div>
                <h3 className="mt-5 text-base font-semibold">
                  {canAsk ? t('kb.qaWelcome') : t('kb.qaNoReadyDocs')}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {canAsk ? kbName : t('kb.qaNoReadyDocsHint')}
                </p>
                <div className="mt-5 flex justify-center">
                  <Badge variant="secondary" className="rounded-md">
                    {canAsk
                      ? t('kb.qaReadyDocs', { n: readyDocuments.length })
                      : t('kb.qaNoReadyDocs')}
                  </Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5 pb-3">
              {messages.map((message) => (
                <QaMessageBubble
                  key={message.id}
                  message={message}
                  kbId={kbId}
                  showThinking={showThinking}
                  thinkingOpen={thinkingOpen[message.id]}
                  onThinkingToggle={toggleThinking}
                  onImageClick={openLightbox}
                  onSourceOpen={openSource}
                  onPageCitation={handlePageCitation}
                  onDeleteRound={handleDeleteRound}
                  onRegenerate={handleRegenerate}
                  isStreaming={isStreaming}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-t bg-background/90 px-3 py-2.5 pb-5">
          <div className="mx-auto w-full max-w-[1600px]">
            <div className="rounded-lg border bg-card px-2 py-1 shadow-sm transition-colors focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
              <div className="flex items-end gap-2">
                <Textarea
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={canAsk ? t('kb.qaPlaceholder') : t('kb.qaNoReadyDocs')}
                  className="max-h-20 min-h-7 resize-none border-0 bg-transparent px-0 py-1 text-sm leading-5 shadow-none focus-visible:ring-0"
                  rows={1}
                  disabled={isStreaming || !canAsk}
                />
                <label className="mb-1.5 hidden cursor-pointer items-center gap-2 whitespace-nowrap text-[12px] text-muted-foreground sm:flex">
                  <Checkbox
                    checked={showThinking}
                    onCheckedChange={(checked) => setShowThinking(!!checked)}
                  />
                  {t('kb.qaThinkingToggle')}
                </label>
                {isStreaming ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAbort}
                    className="h-8 shrink-0"
                  >
                    <StopCircle data-icon="inline-start" />
                    {t('kb.qaStop')}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSubmit}
                    disabled={!question.trim() || !canAsk}
                    className="h-8 shrink-0"
                  >
                    <Send data-icon="inline-start" />
                    {t('kb.qaSend')}
                  </Button>
                )}
              </div>
              <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground sm:hidden">
                <Checkbox
                  checked={showThinking}
                  onCheckedChange={(checked) => setShowThinking(!!checked)}
                />
                {t('kb.qaThinkingToggle')}
              </label>
            </div>
          </div>
        </div>
      </div>

      <KbImageLightbox
        imageUrl={lightboxImage}
        title={lightboxTitle}
        onClose={() => setLightboxImage(null)}
      />

      {sourcePreview && (
        <KbDocumentOriginalSheet
          kbId={kbId}
          doc={sourcePreview.doc}
          page={sourcePreview.page}
          open={!!sourcePreview}
          onOpenChange={(open) => {
            if (!open) setSourcePreview(null)
          }}
        />
      )}
    </div>
  )
}

function QaMessageBubble({
  message,
  kbId,
  showThinking,
  thinkingOpen,
  onThinkingToggle,
  onImageClick,
  onSourceOpen,
  onPageCitation,
  onDeleteRound,
  onRegenerate,
  isStreaming,
}: {
  message: QaMessage
  kbId: string
  showThinking: boolean
  thinkingOpen: boolean | undefined
  onThinkingToggle: (id: string, open: boolean) => void
  onImageClick: (url: string, title: string) => void
  onSourceOpen: (node: ScoredNode) => void
  onPageCitation: (docId: string, page: number) => void
  onDeleteRound: (id: string) => void
  onRegenerate: (id: string) => void
  isStreaming: boolean
}) {
  const t = useT()
  const hasThinking = !!message.reasoning?.trim()
  const hasAssets = (message.answerAssets?.length ?? 0) > 0

  // Memoize so the prop reference to ChatTextBlock is stable across
  // re-renders triggered by unrelated state (e.g. opening the original
  // preview sheet). Otherwise ReactMarkdown re-parses and the
  // overflow-auto table wrapper loses its inner scroll position.
  const linkifiedContent = useMemo(
    () => linkifyPageCitations(message.content, resolveCitationDoc(message.answerSources)),
    [message.content, message.answerSources],
  )
  const handleInterceptClick = useCallback(
    (href: string) => {
      const parsed = parsePageCitationHref(href)
      if (!parsed) return
      onPageCitation(parsed.docId, parsed.page)
    },
    [onPageCitation],
  )

  // Auto-open the thinking panel while streaming is in flight so users
  // can watch reasoning land live. After streaming ends we collapse it
  // back so the panel isn't permanently taking up reading space. User
  // toggles win — once they click the summary themselves we stop
  // overriding their choice.
  const detailsOpen = thinkingOpen === undefined ? !!message.pending : thinkingOpen

  // Reasoning panel sticky-bottom — same idea as the outer scroll: keep
  // following the latest reasoning text unless the user has scrolled up
  // inside the panel to read something.
  const reasoningRef = useRef<HTMLDivElement | null>(null)
  const reasoningStickRef = useRef(true)
  useEffect(() => {
    if (!detailsOpen) return
    const el = reasoningRef.current
    if (!el) return
    if (!reasoningStickRef.current) return
    // rAF so the DOM has painted the new text and scrollHeight reflects
    // the actual content height before we drive scrollTop.
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
  }, [message.reasoning, detailsOpen])

  if (message.role === 'user') {
    return (
      <article className="flex justify-end">
        <div className="max-w-[min(78%,720px)]">
          <div className="mb-1.5 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span>{t('kb.qaYou')}</span>
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-3" />
            </span>
          </div>
          <div className="rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-sm">
            {message.content}
          </div>
        </div>
      </article>
    )
  }

  return (
    <article className="group flex justify-start">
      <div className="w-full">
        <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-muted text-primary">
            <Bot className="size-3" />
          </span>
          <span className="font-medium text-foreground">{t('kb.qaAssistant')}</span>
          {message.stage && (
            <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium">
              {message.stage}
            </Badge>
          )}
        </div>

        <div
          className={cn(
            'flex flex-col gap-3 rounded-2xl rounded-tl-md border bg-background p-4 shadow-sm',
            message.error && 'border-destructive/40 bg-destructive/5',
          )}
        >
          {showThinking && (hasThinking || (message.pending && !message.content)) && (
            <details
              className="max-w-3xl overflow-hidden rounded-xl border bg-muted/30"
              open={detailsOpen}
              onToggle={(e) => {
                const nextOpen = (e.currentTarget as HTMLDetailsElement).open
                if (nextOpen !== detailsOpen) {
                  onThinkingToggle(message.id, nextOpen)
                }
              }}
            >
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12px] font-medium text-muted-foreground hover:text-foreground">
                <Sparkles className="size-3.5" />
                <span>{t('kb.qaReasoning')}</span>
              </summary>
              <div
                ref={reasoningRef}
                onScroll={(e) => {
                  const target = e.currentTarget
                  const distance = target.scrollHeight - target.scrollTop - target.clientHeight
                  reasoningStickRef.current = distance < 24
                }}
                className="max-h-48 overflow-y-auto px-3 pb-3 text-[12px] leading-relaxed text-muted-foreground"
              >
                {hasThinking ? (
                  <pre className="whitespace-pre-wrap font-sans">{message.reasoning}</pre>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    {message.progressDetail || message.stage || t('kb.qaStatusRetrieving')}
                    <span className="inline-flex gap-1" aria-hidden="true">
                      <span className="size-1 rounded-full bg-current opacity-30 animate-pulse" />
                      <span className="size-1 rounded-full bg-current opacity-50 animate-pulse" />
                      <span className="size-1 rounded-full bg-current opacity-70 animate-pulse" />
                    </span>
                  </span>
                )}
              </div>
            </details>
          )}

          {message.content ? (
            <div className="text-sm leading-relaxed">
              <ChatTextBlock
                content={linkifiedContent}
                shouldIntercept={isPageCitationHref}
                onIntercept={handleInterceptClick}
              />
              {message.pending && (
                <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary/60 align-text-bottom" />
              )}
            </div>
          ) : message.pending && !showThinking ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {message.progressDetail || message.stage || t('kb.qaStatusRetrieving')}
            </div>
          ) : null}

          {!message.pending && hasAssets && (
            <KbAnswerAssets
              kbId={kbId}
              assets={message.answerAssets ?? []}
              onImageClick={onImageClick}
            />
          )}

          {!message.pending && !message.content && (
            <p className="text-[12px] text-muted-foreground">{t('kb.qaNoSources')}</p>
          )}

          {!message.pending && (
            <div className="flex items-center gap-1 border-t pt-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onRegenerate(message.id)}
                disabled={isStreaming}
                title={t('kb.qaRegenerate')}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              >
                <RefreshCw data-icon="inline-start" />
                {t('kb.qaRegenerate')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => onDeleteRound(message.id)}
                disabled={isStreaming}
                title={t('kb.qaDeleteRound')}
                className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              >
                <Trash2 data-icon="inline-start" />
                {t('kb.qaDeleteRound')}
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
