import { createHash, randomUUID } from 'crypto'
import { extname } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { registry, ensureRegistryInitialized, resolveGatewayUrl } from '@/lib/gateway/registry'
import { decrypt } from '@/lib/auth/encryption'
import { GatewayClient } from '@/lib/gateway/client'
import { sendMessageSchema } from '@/lib/validations/chat'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { dockerManager } from '@/lib/docker/manager'
import {
  buildSessionInputPath,
  buildSessionOutputPath,
  buildCurrentSessionLinkPath,
  buildCurrentSessionTarget,
  resolveExternalSessionFilePath,
  buildExternalCurrentSessionLinkPath,
  buildExternalWorkspaceSessionLinkPath,
  buildExternalWorkspaceSessionTarget,
} from '@/lib/session-files/helpers'
import {
  artifactLinksMarkdown,
  createContainerSessionOutputSnapshot,
  createExternalSessionOutputSnapshot,
} from '@/lib/session-files/artifacts'
import type { SessionOutputSnapshot } from '@/lib/session-files/artifacts'
import * as hostFileOps from '@/lib/session-files/host-file-ops'
import { appendLiveMessages, archiveSession, saveLiveSnapshot } from '@/lib/chat/snapshot-helpers'
import { finalizeAssistantArtifacts } from '@/lib/chat/artifact-finalizer'
import {
  buildChatRuntimeSessionKey,
  fromDbChatRuntime,
  instanceSupportsPiRuntime,
  toDbChatRuntime,
} from '@/lib/chat/runtime'
import { getRuntimeGatewayClient, markSessionInactive } from '@/lib/chat/runtime-gateway'
import { buildPiChatSendParams, resolvePiGatewayUrl } from '@/lib/chat/pi-runtime-gateway'
import {
  MIME_BY_EXT,
  extractMediaPaths,
  readImageAsDataUrl,
  readContainerImageAsDataUrl,
} from '@/lib/chat/image-helpers'
import {
  extractImagesFromGatewayMessage,
  extractTextFromGatewayMessage,
  extractThinkingFromGatewayMessage,
} from '@/lib/chat/gateway-message-content'
import { computeTextDelta } from '@/lib/chat/stream-delta'
import { activeRuns } from '@/lib/chat/active-runs'
import type { ChatStreamEvent, ChatContentBlock } from '@/types/chat'
import type { ChatHistoryResult } from '@/types/gateway'

const PI_CONNECTION_LOST_ERROR = 'Pi agent connection lost'

function encodeSSE(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

interface GatewayAttachment {
  fileName: string
  mimeType: string
  content: string
}

function attachmentContentKey(att: Pick<GatewayAttachment, 'mimeType' | 'content'>): string {
  return createHash('sha256').update(att.mimeType).update(':').update(att.content).digest('hex')
}

function dedupeAttachments<T extends Pick<GatewayAttachment, 'mimeType' | 'content'>>(
  attachments: T[],
): T[] {
  const seen = new Set<string>()
  const unique: T[] = []

  for (const att of attachments) {
    const key = attachmentContentKey(att)
    if (seen.has(key)) continue
    unique.push(att)
    seen.add(key)
  }

  return unique
}

/**
 * Snapshot + archive the currently active session, then activate the target session.
 * Used when sending a message to a non-active (historical) session.
 */
async function switchActiveSession(
  userId: string,
  instanceId: string,
  agentId: string,
  targetSessionId: string,
) {
  const activeSession = await prisma.chatSession.findFirst({
    where: { userId, instanceId, agentId, isActive: true },
  })

  if (activeSession && activeSession.id !== targetSessionId) {
    const activeRuntime = fromDbChatRuntime(activeSession.runtime)
    const lease = await getRuntimeGatewayClient(instanceId, activeRuntime).catch(() => null)

    if (!lease) {
      await markSessionInactive(activeSession.id)
    } else {
      try {
        await archiveSession(activeSession.id, instanceId, agentId, userId, lease.client, {
          runtime: activeRuntime,
          triggerMemoryDump: activeRuntime === 'openclaw',
          waitForNewCompletion: activeRuntime === 'openclaw',
        })
      } finally {
        lease.release()
      }
    }
  }

  // Activate target session
  await prisma.chatSession.update({
    where: { id: targetSessionId },
    data: { isActive: true },
  })
}

// POST /api/v1/chat/send — SSE streaming endpoint
export async function POST(req: NextRequest) {
  // --- Auth (inline, because SSE needs the stream setup before returning) ---
  let userId = req.headers.get('x-user-id')

  if (!userId) {
    const authHeader = req.headers.get('authorization')
    const cookieToken = req.cookies.get('access_token')?.value
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : cookieToken

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
    }

    userId = payload.userId
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, departmentId: true, status: true },
  })

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'User not found or disabled' }, { status: 401 })
  }

  const userRole = user.role // Always use DB role, never trust header

  // --- Validate body ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = sendMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const {
    instanceId,
    agentId,
    runtime,
    message,
    sessionId: targetSessionId,
    attachments,
  } = parsed.data
  const dbRuntime = toDbChatRuntime(runtime)

  // --- Permission check ---
  if (userRole !== 'SYSTEM_ADMIN') {
    if (!user.departmentId) {
      return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
    }

    // Layer 1: Instance access (department-level)
    const access = await prisma.instanceAccess.findUnique({
      where: {
        departmentId_instanceId: {
          departmentId: user.departmentId,
          instanceId,
        },
      },
    })

    if (!access) {
      return NextResponse.json({ error: 'No access to this instance' }, { status: 403 })
    }

    // Layer 2: Agent classification visibility
    const agentMeta = await prisma.agentMeta.findUnique({
      where: { instanceId_agentId: { instanceId, agentId } },
    })

    if (agentMeta) {
      const { isAgentVisible } = await import('@/lib/agents/helpers')
      const authUser = {
        id: user.id,
        role: userRole ?? user.role,
        departmentId: user.departmentId,
        name: '',
        email: '',
        departmentName: null,
        avatar: null,
      }
      if (!isAgentVisible(agentMeta, authUser)) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
      }
    } else {
      // Fallback: legacy agentIds check from InstanceAccess
      const allowedIds = access.agentIds as string[] | null
      if (allowedIds && !allowedIds.includes(agentId)) {
        return NextResponse.json({ error: 'No access to this agent' }, { status: 403 })
      }
    }
  }

  // Fresh GatewayClient per chat.send: persistent sockets receive compressed
  // event streams (single full-text delta, no agent:item tool events) from the
  // v4 gateway. A one-shot client gets full incremental streaming.
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: { gatewayUrl: true, gatewayToken: true, dockerConfig: true, containerName: true },
  })
  if (!instance) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 502 })
  }
  if (runtime === 'pi') {
    if (!instanceSupportsPiRuntime(instance.dockerConfig)) {
      return NextResponse.json(
        { error: 'Pi runtime is not enabled for this instance' },
        { status: 503 },
      )
    }
  }

  // --- Ensure registry ---
  await ensureRegistryInitialized()

  const adapter = registry.getAdapter(instanceId)
  const registryClient = registry.getClient(instanceId)
  if (!adapter || !registryClient) {
    return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
  }

  let piCwd: string | null = null
  if (runtime === 'pi') {
    const agent = await adapter.getAgent(registryClient, agentId)
    if (!agent.workspace) {
      return NextResponse.json({ error: 'Agent workspace is not available' }, { status: 502 })
    }
    piCwd = agent.workspace
  }

  const client = new GatewayClient(
    runtime === 'pi'
      ? resolvePiGatewayUrl(instance)
      : resolveGatewayUrl({ gatewayUrl: instance.gatewayUrl, dockerConfig: instance.dockerConfig }),
    decrypt(instance.gatewayToken),
  )
  await client.connect()

  // --- Build session key ---
  const sessionKey = buildChatRuntimeSessionKey(runtime, agentId, user.id)
  const idempotencyKey = randomUUID()

  // --- Resolve visible conversation group if targeting an existing conversation ---
  let conversationGroupId: string | null = null

  // --- Handle session switching if targeting a specific (possibly inactive) session ---
  if (targetSessionId) {
    const targetSession = await prisma.chatSession.findFirst({
      where: {
        userId: user.id,
        instanceId,
        agentId,
        OR: [{ id: targetSessionId }, { conversationGroupId: targetSessionId }],
      },
    })
    if (targetSession) {
      conversationGroupId = targetSession.conversationGroupId ?? targetSession.id
      const targetRuntimeSession =
        targetSession.runtime === dbRuntime
          ? targetSession
          : await prisma.chatSession.findFirst({
              where: {
                userId: user.id,
                instanceId,
                agentId,
                runtime: dbRuntime,
                OR: [{ id: conversationGroupId }, { conversationGroupId }],
              },
            })
      if (targetRuntimeSession && !targetRuntimeSession.isActive) {
        await switchActiveSession(user.id, instanceId, agentId, targetRuntimeSession.id)
      }
    }
  }

  // --- Find or create ChatSession (atomic to prevent race conditions) ---
  const session = await prisma.$transaction(async (tx) => {
    const existing = conversationGroupId
      ? await tx.chatSession.findFirst({
          where: {
            userId: user.id,
            instanceId,
            agentId,
            runtime: dbRuntime,
            OR: [{ id: conversationGroupId }, { conversationGroupId }],
          },
        })
      : await tx.chatSession.findFirst({
          where: { userId: user.id, instanceId, agentId, runtime: dbRuntime, isActive: true },
        })
    if (existing) {
      await tx.chatSession.update({
        where: { id: existing.id },
        data: {
          sessionId: sessionKey,
          conversationGroupId: conversationGroupId ?? existing.conversationGroupId ?? existing.id,
          isActive: true,
          lastMessageAt: new Date(),
          messageCount: { increment: 1 },
          // Set title from first user message if not yet set (e.g. session
          // created via /conversations/new which leaves title null)
          ...(!existing.title ? { title: message.slice(0, 50) } : {}),
        },
      })
      return existing
    }
    return tx.chatSession.create({
      data: {
        userId: user.id,
        instanceId,
        agentId,
        sessionId: sessionKey,
        runtime: dbRuntime,
        conversationGroupId: conversationGroupId ?? randomUUID(),
        lastMessageAt: new Date(),
        messageCount: 1,
        isActive: true,
        title: message.slice(0, 50),
      },
    })
  })
  const existingSession = session
  const chatSessionId = session.id
  const visibleConversationId = session.conversationGroupId ?? session.id
  const runStartedAt = new Date()

  // --- SSE Stream ---
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  let closed = false
  let lastTextContent = ''
  let lastThinkingContent = ''
  let lastImageCount = 0
  let finishStarted = false
  const pendingImageReads: Promise<void>[] = []
  // Resolved in the async IIFE below; used by fetchAndEmitImages + tool result handler
  let containerId: string | null = null
  let instanceWorkspacePath: string | null = null
  let containerOutputSnapshot: SessionOutputSnapshot | null = null
  let externalOutputSnapshot: SessionOutputSnapshot | null = null
  // Track the active tool name for command_output routing and buffer per-tool output
  // between item:start and item:end events.
  let activeToolName: string | null = null
  const toolOutputBuf = new Map<string, string>()
  // Capture tool inputs from SSE item events for liveMessages persistence.
  // chat.history only returns tool results (output), not the original args/input.
  const capturedToolInputs: { toolName: string; toolInput: unknown }[] = []
  // Capture images from SSE events for liveMessages persistence.
  // chat.history doesn't return inline image blocks, so we must capture
  // them from the live chat events where OpenClaw embeds them.
  const capturedImages: { imageUrl: string; mimeType?: string }[] = []
  let terminalErrorMessage: string | null = null
  // User-uploaded attachments (images) — passed to saveLiveSnapshot for persistence.
  // Gateway chat.history strips user image attachments, so we save them in liveMessages.
  const userImageAttachments: { name: string; mimeType: string; content: string }[] = []

  function write(event: ChatStreamEvent) {
    if (closed) return
    writer.write(encoder.encode(encodeSSE(event))).catch(() => {
      closed = true
    })
  }

  // Track active run so the history API can report isRunning
  activeRuns.add(chatSessionId)

  // Send session ID as the first event so the frontend can track this session
  write({ type: 'session', sessionId: visibleConversationId })

  // SSE heartbeat: keep connection alive during long tool-use runs.
  // OpenClaw broadcasts tool events via stream=item + stream=command_output (2026.4+),
  // but during extended tool execution the stream can still be idle.
  // Without heartbeat, proxies and browsers may close the idle connection.
  const heartbeatTimer = setInterval(() => {
    if (closed) {
      clearInterval(heartbeatTimer)
      return
    }
    // SSE comment line — ignored by data: parser but keeps TCP alive
    writer.write(encoder.encode(': heartbeat\n\n')).catch(() => {
      closed = true
      clearInterval(heartbeatTimer)
    })
  }, 15_000) // every 15 seconds

  async function close() {
    if (closed) return
    clearInterval(heartbeatTimer)
    // Wait for any pending image reads to complete before closing
    if (pendingImageReads.length > 0) {
      await Promise.allSettled(pendingImageReads)
    }
    closed = true
    writer.close().catch(() => {})
  }

  /**
   * Scan chat.history for MEDIA paths in tool results and emit as image SSE events.
   * OpenClaw does NOT send image data in WebSocket chat events — images only exist
   * as files referenced by MEDIA: paths in tool output text.
   */
  async function fetchAndEmitImages() {
    try {
      const rawResult = await client!.request('chat.history', { sessionKey, limit: 50 }, 10_000)
      const historyResult = rawResult as ChatHistoryResult
      const messages = historyResult.messages ?? []

      // Collect MEDIA paths from tool results in the last few messages
      const allPaths: string[] = []
      for (const msg of messages.slice(-20)) {
        if (msg.role !== 'toolResult') continue
        const text =
          typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? (msg.content as Record<string, unknown>[])
                  .filter((b) => b.type === 'text')
                  .map((b) => b.text as string)
                  .join('\n')
              : ''
        allPaths.push(...extractMediaPaths(text))
      }

      const uniquePaths = [...new Set(allPaths)]
      if (uniquePaths.length === 0) return

      await Promise.all(
        uniquePaths.map(async (p) => {
          const dataUrl = containerId
            ? await readContainerImageAsDataUrl(containerId, p)
            : await readImageAsDataUrl(p)
          if (dataUrl) {
            const ext = extname(p).toLowerCase()
            const mimeType = MIME_BY_EXT[ext]
            write({ type: 'image', imageUrl: dataUrl, mimeType })
            capturedImages.push({ imageUrl: dataUrl, mimeType })
          } else {
            console.warn(
              `[fetchAndEmitImages] Failed to read image: ${p} (containerId=${containerId ?? 'host'})`,
            )
          }
        }),
      )
    } catch (err) {
      console.warn('[fetchAndEmitImages] chat.history failed:', (err as Error).message)
    }
  }

  async function normalizeAndEmitArtifactLinks(): Promise<string | undefined> {
    try {
      const result = await finalizeAssistantArtifacts({
        agentId,
        chatSessionId,
        runStartedAt,
        assistantText: lastTextContent,
        containerId,
        workspacePath: instanceWorkspacePath,
        execWithOutput: dockerManager.execWithOutput.bind(dockerManager),
        containerOutputSnapshot,
        externalOutputSnapshot,
      })
      if (!result) return undefined
      const augmented = result.content
      const previous = lastTextContent.trimEnd()
      const streamContent =
        previous && augmented.startsWith(previous)
          ? augmented.slice(previous.length)
          : previous
            ? `\n\n${artifactLinksMarkdown(result.artifacts)}`
            : augmented
      if (streamContent.trim()) {
        write({ type: 'text', content: streamContent })
        lastTextContent = augmented
        return augmented
      }
    } catch (err) {
      console.warn('[session-artifacts] normalization failed:', (err as Error).message)
    }
    return undefined
  }

  async function appendFallbackArtifactLiveMessages(content: string): Promise<void> {
    await appendLiveMessages(chatSessionId, [
      {
        id: randomUUID(),
        role: 'user',
        content: message,
        runtime,
        messageSeq: 0,
        createdAt: runStartedAt.toISOString(),
      },
      {
        id: randomUUID(),
        role: 'assistant',
        content,
        runtime,
        messageSeq: 1,
        isFinal: true,
        stopReason: 'stop',
        createdAt: new Date().toISOString(),
      },
    ])
  }

  async function saveSnapshotThenFinish() {
    if (finishStarted) return
    finishStarted = true
    activeRuns.delete(chatSessionId)

    const assistantContentOverride = await normalizeAndEmitArtifactLinks()
    try {
      await saveLiveSnapshot(
        chatSessionId,
        client!,
        sessionKey,
        containerId,
        capturedImages,
        userImageAttachments,
        capturedToolInputs,
        assistantContentOverride,
        terminalErrorMessage ?? undefined,
      )
    } catch (err) {
      console.error('[live-snapshot] Save failed:', err)
      if (assistantContentOverride) {
        try {
          await appendFallbackArtifactLiveMessages(assistantContentOverride)
        } catch (fallbackErr) {
          console.error('[live-snapshot] Fallback save failed:', fallbackErr)
        }
      }
    }
    write({ type: 'done' })
    await cleanup()
  }

  const unsubChat = client.on('chat', (payload: unknown) => {
    const evt = payload as Record<string, unknown> | undefined
    if (!evt) return
    if (evt.runId !== idempotencyKey) return

    const state = evt.state as string

    if (state === 'delta') {
      const textContent = extractTextFromGatewayMessage(evt.message)
      const thinkingContent = extractThinkingFromGatewayMessage(evt.message)

      if (thinkingContent && thinkingContent !== lastThinkingContent) {
        const newThinking = thinkingContent.slice(lastThinkingContent.length)
        if (newThinking) write({ type: 'thinking', content: newThinking })
        lastThinkingContent = thinkingContent
      }

      // When preamble events already delivered the text incrementally,
      // the chat delta is a duplicate. Skip it.
      if (textContent !== lastTextContent) {
        const tdelta = computeTextDelta({
          deltaText: evt.deltaText as string | undefined,
          replace: evt.replace as boolean | undefined,
          cumulative: textContent,
          lastEmitted: lastTextContent,
        })
        if (tdelta.text) write({ type: 'text', content: tdelta.text })
        lastTextContent = tdelta.nextLast
      }

      // Capture inline image blocks if OpenClaw embeds them in chat events
      const images = extractImagesFromGatewayMessage(evt.message)
      for (let i = lastImageCount; i < images.length; i++) {
        write({
          type: 'image',
          imageUrl: images[i].url,
          mimeType: images[i].mimeType,
          alt: images[i].alt,
        })
        capturedImages.push({ imageUrl: images[i].url, mimeType: images[i].mimeType })
      }
      lastImageCount = images.length
    } else if (state === 'final') {
      // Chat final arrived — cancel the lifecycle fallback timer
      if (lifecycleEndTimer) {
        clearTimeout(lifecycleEndTimer)
        lifecycleEndTimer = null
      }
      // Immediately clear active run status so history polls don't report
      // isRunning=true during the (potentially slow) post-run cleanup.
      activeRuns.delete(chatSessionId)

      const textContent = extractTextFromGatewayMessage(evt.message)
      const thinkingContent = extractThinkingFromGatewayMessage(evt.message)

      if (thinkingContent && thinkingContent !== lastThinkingContent) {
        const newThinking = thinkingContent.slice(lastThinkingContent.length)
        if (newThinking) write({ type: 'thinking', content: newThinking })
      }

      // v4: computeTextDelta handles deltaText/replace/cumulative-slice uniformly
      const tdelta = computeTextDelta({
        deltaText: evt.deltaText as string | undefined,
        replace: evt.replace as boolean | undefined,
        cumulative: textContent,
        lastEmitted: lastTextContent,
      })
      if (tdelta.text) write({ type: 'text', content: tdelta.text })
      lastTextContent = tdelta.nextLast

      // Capture any remaining inline image blocks from final message
      const images = extractImagesFromGatewayMessage(evt.message)
      for (let i = lastImageCount; i < images.length; i++) {
        write({
          type: 'image',
          imageUrl: images[i].url,
          mimeType: images[i].mimeType,
          alt: images[i].alt,
        })
        capturedImages.push({ imageUrl: images[i].url, mimeType: images[i].mimeType })
      }

      // Scan chat.history for MEDIA paths in tool results and emit as image events.
      // Must run before 'done' so frontend displays images in the same streaming session.
      fetchAndEmitImages()
        // Await saveLiveSnapshot BEFORE sending 'done' so that when the client
        // calls syncFromHistory (triggered by 'done'), liveMessages in the DB
        // already contain user-uploaded images, resolved MEDIA images, and
        // deterministic output links.
        .then(saveSnapshotThenFinish)
        .catch(saveSnapshotThenFinish)
    } else if (state === 'error') {
      if (lifecycleEndTimer) {
        clearTimeout(lifecycleEndTimer)
        lifecycleEndTimer = null
      }
      activeRuns.delete(chatSessionId)
      terminalErrorMessage = String(evt.errorMessage ?? 'Unknown error')
      write({
        type: 'error',
        error: terminalErrorMessage,
      })
      void saveSnapshotThenFinish()
    } else if (state === 'aborted') {
      if (lifecycleEndTimer) {
        clearTimeout(lifecycleEndTimer)
        lifecycleEndTimer = null
      }
      activeRuns.delete(chatSessionId)
      terminalErrorMessage = 'Conversation aborted'
      write({ type: 'error', error: terminalErrorMessage })
      void saveSnapshotThenFinish()
    }
  })

  // Fallback timer: if agent lifecycle signals "end" but no chat "final"
  // arrives within 5 seconds, force-close the SSE stream.  This prevents
  // the loading-dots from spinning forever when the chat final event is
  // lost (WS reconnect, gateway race, etc.).
  let lifecycleEndTimer: ReturnType<typeof setTimeout> | null = null

  const unsubAgent = client.on('agent', (payload: unknown) => {
    const evt = payload as Record<string, unknown> | undefined
    if (!evt) return
    if (evt.runId !== idempotencyKey) return

    const stream = evt.stream as string | undefined

    // ── Lifecycle: safety net for missing chat final ──
    if (stream === 'lifecycle') {
      const data = (evt.data ?? {}) as Record<string, unknown>
      const phase = data.phase as string
      if ((phase === 'end' || phase === 'error') && !lifecycleEndTimer) {
        lifecycleEndTimer = setTimeout(async () => {
          if (finishStarted) return
          console.warn(
            `[chat/send] lifecycle ${phase} received but no chat final after 5s — forcing done (session=${chatSessionId})`,
          )
          await saveSnapshotThenFinish()
        }, 5_000)
      }
      return
    }

    // ── Item: tool lifecycle events (OpenClaw 2026.4+) ──
    // ── Item: tool/thinking/preamble events (OpenClaw 2026.4+) ──
    // v4 gateway may prefix item events with the agent runtime id
    // (e.g. "codex_app_server.item") instead of bare "item".
    if (stream === 'item' || (typeof stream === 'string' && stream.endsWith('.item'))) {
      const data = (evt.data ?? {}) as Record<string, unknown>
      const kind = data.kind as string | undefined

      // v4 gateway pushes incremental text through agent item preamble
      // events instead of chat delta events when routed through the built-in
      // agent runtime.  Route them as text SSE events for the typewriter effect.
      if (kind === 'preamble') {
        const progressText = data.progressText as string | undefined
        if (progressText) {
          const d = computeTextDelta({
            cumulative: progressText,
            lastEmitted: lastTextContent,
          })
          if (d.text) write({ type: 'text', content: d.text })
          lastTextContent = d.nextLast
        }
        return
      }
      // kind=analysis → agent reasoning, skip per user preference (thinking hidden)
      if (kind === 'analysis') return

      const phase = data.phase as string
      const toolName = String(data.name ?? 'tool')

      // kind=command is how the v4 gateway sends tool execution events through
      // the built-in agent runtime (codex-app-server). Direct WS connections get
      // kind=tool; GatewayClient connections get kind=command with the same shape.
      if (kind === 'tool' || kind === 'command') {
        if (phase === 'start') {
          activeToolName = toolName
          toolOutputBuf.set(toolName, '')
          const toolInput = data.meta ?? data.args ?? {}
          capturedToolInputs.push({ toolName, toolInput })
          write({
            type: 'tool_call',
            toolName,
            toolInput,
          })
        } else if (phase === 'end') {
          // Flush accumulated command_output + any result text
          const accumulated = toolOutputBuf.get(toolName) ?? ''
          const resultText = typeof data.result === 'string' ? data.result : ''
          const combinedOutput = resultText || accumulated || data.status || null

          write({
            type: 'tool_result',
            toolName,
            toolOutput: combinedOutput,
          })
          toolOutputBuf.delete(toolName)
          if (activeToolName === toolName) activeToolName = null

          // Detect image file paths in tool output (e.g. "MEDIA: /path/to/image.png")
          // and emit them as image SSE events
          const outputText = combinedOutput ? String(combinedOutput) : ''
          const mediaPaths = extractMediaPaths(outputText)
          if (mediaPaths.length > 0) {
            const imageReadPromise = Promise.all(
              mediaPaths.map(async (p) => {
                const dataUrl = containerId
                  ? await readContainerImageAsDataUrl(containerId, p)
                  : await readImageAsDataUrl(p)
                if (dataUrl) {
                  const ext = extname(p).toLowerCase()
                  const mimeType = MIME_BY_EXT[ext]
                  write({ type: 'image', imageUrl: dataUrl, mimeType })
                  capturedImages.push({ imageUrl: dataUrl, mimeType })
                }
              }),
            )
              .then(() => {})
              .catch(() => {})
            pendingImageReads.push(imageReadPromise)
          }
        }
        // phase === 'update' — no SSE event needed
      }
      // kind === 'command' — lifecycle only, output arrives via command_output
      return
    }

    // ── Command output: tool result text stream (OpenClaw 2026.4+) ──
    if (stream === 'command_output') {
      const data = (evt.data ?? {}) as Record<string, unknown>
      const output = data.output as string | undefined
      if (output) {
        const target = String(data.toolName ?? activeToolName ?? '__current__')
        const current = toolOutputBuf.get(target) ?? ''
        toolOutputBuf.set(target, current + output)
      }
      return
    }
  })

  async function cleanup() {
    if (lifecycleEndTimer) {
      clearTimeout(lifecycleEndTimer)
      lifecycleEndTimer = null
    }
    activeRuns.delete(chatSessionId)
    unsubChat()
    unsubAgent()
    client.disconnect()
    await close()
  }

  if (runtime === 'pi') {
    client.onUnexpectedDisconnect = () => {
      if (finishStarted || closed) return
      activeRuns.delete(chatSessionId)
      write({ type: 'error', error: PI_CONNECTION_LOST_ERROR })
      void saveSnapshotThenFinish()
    }
  }

  // --- Auto-attach session images + send message (runs in background) ---
  // Start async work WITHOUT blocking the SSE response. This ensures the
  // client gets the SSE connection immediately (no multi-second delay from
  // Docker exec operations like symlink creation, dir listing, and image download).
  ;(async () => {
    const sessionFileAttachments: GatewayAttachment[] = []
    const SESSION_IMAGE_EXTS: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.bmp': 'image/bmp',
    }
    const SESSION_IMAGE_MAX = 5 * 1024 * 1024 // 5MB per image for attachment
    try {
      const activeSession =
        existingSession ??
        (await prisma.chatSession.findFirst({
          where: { userId: user.id, instanceId, agentId, runtime: dbRuntime, isActive: true },
        }))
      if (activeSession) {
        const instance = await prisma.instance.findUnique({
          where: { id: instanceId },
          select: { containerId: true, workspacePath: true },
        })
        containerId = instance?.containerId ?? null
        instanceWorkspacePath = instance?.workspacePath ?? null
        if (instance?.containerId) {
          const inputPath = buildSessionInputPath(agentId, activeSession.id)

          // Update `current-session` symlink so the agent can find files via
          // `current-session/input/` without needing injected paths.
          // Pre-create both input/ and output/ so agent sees them immediately.
          try {
            const linkPath = buildCurrentSessionLinkPath(agentId)
            const target = buildCurrentSessionTarget(activeSession.id)
            const outputPath = buildSessionOutputPath(agentId, activeSession.id)
            await Promise.all([
              dockerManager.execInContainer(instance.containerId, [
                'ln',
                '-sfn',
                '--',
                target,
                linkPath,
              ]),
              dockerManager.ensureContainerDir(instance.containerId, inputPath),
              dockerManager.ensureContainerDir(instance.containerId, outputPath),
            ])
          } catch {
            // Non-fatal: symlink/mkdir failure doesn't block chat
          }
          try {
            containerOutputSnapshot = await createContainerSessionOutputSnapshot({
              containerId: instance.containerId,
              agentId,
              chatSessionId: activeSession.id,
              execWithOutput: dockerManager.execWithOutput.bind(dockerManager),
            })
          } catch (err) {
            console.warn(
              '[session-artifacts] container output snapshot failed:',
              (err as Error).message,
            )
          }

          let inputFiles: { name: string; path: string; type: string; size: number }[] = []
          try {
            inputFiles = await dockerManager.listContainerDir(instance.containerId, inputPath)
          } catch {}

          // Auto-attach images from input/ as base64 attachments so the model can see them.
          // No text injection — session file rules and discovery are handled by AGENTS.md.
          for (const f of inputFiles) {
            if (f.type !== 'file' || f.size > SESSION_IMAGE_MAX) continue
            const ext = ('.' + (f.name.split('.').pop() ?? '')).toLowerCase()
            const mime = SESSION_IMAGE_EXTS[ext]
            if (!mime) continue
            try {
              const filePath = `${inputPath}${f.name}`
              const buf = await dockerManager.downloadFileFromContainer(
                instance.containerId,
                filePath,
              )
              sessionFileAttachments.push({
                fileName: f.name,
                mimeType: mime,
                content: buf.toString('base64'),
              })
            } catch {
              // Skip unreadable images
            }
          }
        } else if (instance?.workspacePath) {
          const wp = instance.workspacePath
          const inputPath = resolveExternalSessionFilePath(wp, agentId, activeSession.id, 'input')
          const outputPath = resolveExternalSessionFilePath(wp, agentId, activeSession.id, 'output')
          const agentDirLink = buildExternalCurrentSessionLinkPath(wp, agentId)
          const agentDirTarget = `sessions/${activeSession.id}`

          // Also create symlink in the workspace dir (agent's CWD) so relative
          // `current-session/input/` works.  Target is relative back to agents dir.
          const wsLink = buildExternalWorkspaceSessionLinkPath(wp, agentId)
          const wsTarget = buildExternalWorkspaceSessionTarget(agentId, activeSession.id)

          try {
            await Promise.all([
              hostFileOps.ensureDir(inputPath, wp),
              hostFileOps.ensureDir(outputPath, wp),
              hostFileOps.createSymlink(agentDirTarget, agentDirLink, wp),
              hostFileOps.createSymlink(wsTarget, wsLink, wp),
            ])
          } catch {
            // Non-fatal: symlink/mkdir failure doesn't block chat
          }
          try {
            externalOutputSnapshot = await createExternalSessionOutputSnapshot({
              workspacePath: wp,
              agentId,
              chatSessionId: activeSession.id,
            })
          } catch (err) {
            console.warn(
              '[session-artifacts] external output snapshot failed:',
              (err as Error).message,
            )
          }

          let inputFiles: { name: string; path: string; type: string; size: number }[] = []
          try {
            inputFiles = await hostFileOps.listDir(inputPath, wp)
          } catch {}

          for (const f of inputFiles) {
            if (f.type !== 'file' || f.size > SESSION_IMAGE_MAX) continue
            const ext = ('.' + (f.name.split('.').pop() ?? '')).toLowerCase()
            const mime = SESSION_IMAGE_EXTS[ext]
            if (!mime) continue
            try {
              const filePath = `${inputPath}${f.name}`
              const buf = await hostFileOps.readFile(filePath, wp)
              sessionFileAttachments.push({
                fileName: f.name,
                mimeType: mime,
                content: buf.toString('base64'),
              })
            } catch {
              // Skip unreadable images
            }
          }
        }
      }
    } catch {
      // Non-blocking: skip on any error
    }

    const mappedAttachments = dedupeAttachments([
      ...(attachments?.map((a) => ({
        fileName: a.name,
        mimeType: a.mimeType,
        content: a.content,
      })) ?? []),
      ...sessionFileAttachments,
    ])

    // Capture ONLY 📎 chat attachments for liveMessages persistence (not sidebar input/ files).
    // Session file attachments are sent to the agent via mappedAttachments but should NOT
    // appear as contentBlocks in chat message bubbles.
    for (const a of dedupeAttachments(attachments ?? [])) {
      if (a.mimeType.startsWith('image/')) {
        userImageAttachments.push({ name: a.name, mimeType: a.mimeType, content: a.content })
      }
    }

    // Early-save user image attachments to DB to prevent data loss.
    // saveLiveSnapshot runs at run end, but if the container is rebuilt mid-run
    // the image data is permanently lost. By eagerly appending a user message
    // with contentBlocks to liveMessages, mergeExistingContentBlocks (content-based
    // matching) can carry the image forward even if saveLiveSnapshot never runs.
    if (userImageAttachments.length > 0) {
      const imageBlocks: ChatContentBlock[] = userImageAttachments.map((a) => ({
        type: 'image' as const,
        imageUrl: `data:${a.mimeType};base64,${a.content}`,
        mimeType: a.mimeType,
      }))
      try {
        await appendLiveMessages(chatSessionId, [
          {
            id: randomUUID(),
            role: 'user',
            content: message,
            contentBlocks: imageBlocks,
            createdAt: new Date().toISOString(),
          },
        ])
      } catch {
        // Non-fatal: saveLiveSnapshot will handle it at run end
      }
    }

    if (runtime === 'pi') {
      if (!piCwd) throw new Error('Agent workspace is not available')
      await client.request(
        'chat.send',
        buildPiChatSendParams({
          sessionKey,
          message,
          idempotencyKey,
          cwd: piCwd,
          attachments: mappedAttachments.length > 0 ? mappedAttachments : undefined,
        }),
      )
    } else {
      await adapter.sendMessage(client, sessionKey, message, idempotencyKey, {
        attachments: mappedAttachments.length > 0 ? mappedAttachments : undefined,
      })
    }
    // Signal client that gateway has received the message — safe to start
    // progress polling for any tool events that may have been missed.
    write({ type: 'confirmed' })
  })().catch((err) => {
    write({ type: 'error', error: (err as Error).message || 'Failed to send message' })
    cleanup()
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
