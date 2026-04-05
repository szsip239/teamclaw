import { randomUUID } from 'crypto'
import { extname } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
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
import * as hostFileOps from '@/lib/session-files/host-file-ops'
import { archiveSession, saveLiveSnapshot, extractContentBlocks } from '@/lib/chat/snapshot-helpers'
import {
  MIME_BY_EXT,
  extractMediaPaths,
  readImageAsDataUrl,
  readContainerImageAsDataUrl,
} from '@/lib/chat/image-helpers'
import { activeRuns } from '@/lib/chat/active-runs'
import type { ChatStreamEvent, ChatContentBlock } from '@/types/chat'
import type { ChatHistoryResult } from '@/types/gateway'
import { Prisma } from '@/generated/prisma'

function encodeSSE(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

function extractTextFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const record = message as Record<string, unknown>
  const content = record.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const rec = block as Record<string, unknown>
    if (rec.type === 'text' && typeof rec.text === 'string') parts.push(rec.text)
  }
  return parts.join('\n').trim()
}

interface ExtractedImage {
  url: string
  mimeType?: string
  alt?: string
}

function extractImagesFromMessage(message: unknown): ExtractedImage[] {
  if (!message || typeof message !== 'object') return []
  const record = message as Record<string, unknown>
  const content = record.content
  if (!Array.isArray(content)) return []
  const images: ExtractedImage[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const rec = block as Record<string, unknown>
    if (rec.type !== 'image') continue

    let imageUrl = ''
    const source = rec.source as Record<string, unknown> | undefined
    if (source?.type === 'base64' && typeof source.data === 'string') {
      const mediaType = (source.media_type as string) || 'image/png'
      imageUrl = `data:${mediaType};base64,${source.data}`
    } else if (typeof rec.url === 'string') {
      imageUrl = rec.url
    }

    if (imageUrl) {
      images.push({
        url: imageUrl,
        mimeType: source?.media_type as string | undefined,
        alt: typeof rec.alt === 'string' ? rec.alt : undefined,
      })
    }
  }
  return images
}

function extractThinkingFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return ''
  const record = message as Record<string, unknown>
  const content = record.content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const rec = block as Record<string, unknown>
    if (rec.type === 'thinking' && typeof rec.thinking === 'string') parts.push(rec.thinking)
  }
  return parts.join('\n').trim()
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
  sessionKey: string,
) {
  const activeSession = await prisma.chatSession.findFirst({
    where: { userId, instanceId, agentId, isActive: true },
  })

  if (activeSession && activeSession.id !== targetSessionId) {
    await ensureRegistryInitialized()
    const client = registry.getClient(instanceId)

    if (client) {
      await archiveSession(activeSession.id, instanceId, agentId, userId, client, {
        triggerMemoryDump: true,
        waitForNewCompletion: true,
      })
    } else {
      await prisma.chatSession.update({
        where: { id: activeSession.id },
        data: { isActive: false, liveMessages: Prisma.DbNull },
      })
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

  const { instanceId, agentId, message, sessionId: targetSessionId, attachments } = parsed.data

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

  // --- Ensure registry ---
  await ensureRegistryInitialized()

  const client = registry.getClient(instanceId)
  const adapter = registry.getAdapter(instanceId)
  if (!client || !adapter) {
    return NextResponse.json({ error: 'Instance not connected' }, { status: 502 })
  }

  // --- Build session key ---
  const sessionKey = `agent:${agentId}:tc:${user.id}`
  const idempotencyKey = randomUUID()

  // --- Handle session switching if targeting a specific (possibly inactive) session ---
  if (targetSessionId) {
    const targetSession = await prisma.chatSession.findUnique({
      where: { id: targetSessionId },
    })
    if (
      targetSession &&
      targetSession.userId === user.id &&
      targetSession.instanceId === instanceId &&
      targetSession.agentId === agentId &&
      !targetSession.isActive
    ) {
      await switchActiveSession(user.id, instanceId, agentId, targetSessionId, sessionKey)
    }
  }

  // --- Find or create ChatSession (atomic to prevent race conditions) ---
  const session = await prisma.$transaction(async (tx) => {
    const existing = await tx.chatSession.findFirst({
      where: { userId: user.id, instanceId, agentId, isActive: true },
    })
    if (existing) {
      await tx.chatSession.update({
        where: { id: existing.id },
        data: {
          sessionId: sessionKey,
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
        lastMessageAt: new Date(),
        messageCount: 1,
        isActive: true,
        title: message.slice(0, 50),
      },
    })
  })
  const existingSession = session
  const chatSessionId = session.id

  // --- SSE Stream ---
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()
  const encoder = new TextEncoder()

  let closed = false
  let lastTextContent = ''
  let lastThinkingContent = ''
  let lastImageCount = 0
  const pendingImageReads: Promise<void>[] = []
  // Resolved in the async IIFE below; used by fetchAndEmitImages + tool result handler
  let containerId: string | null = null
  // Capture images from SSE events for liveMessages persistence.
  // chat.history doesn't return inline image blocks, so we must capture
  // them from the live chat events where OpenClaw embeds them.
  const capturedImages: { imageUrl: string; mimeType?: string }[] = []
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
  write({ type: 'session', sessionId: chatSessionId })

  // SSE heartbeat: keep connection alive during long tool-use runs.
  // OpenClaw doesn't broadcast tool events, so the stream can be idle
  // for minutes while the agent works. Without heartbeat, proxies and
  // browsers may close the idle connection (nginx proxy_read_timeout, etc.).
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

  const unsubChat = client.on('chat', (payload: unknown) => {
    if (closed) return
    const evt = payload as Record<string, unknown> | undefined
    if (!evt) return
    if (evt.runId !== idempotencyKey) return

    const state = evt.state as string

    if (state === 'delta') {
      const textContent = extractTextFromMessage(evt.message)
      const thinkingContent = extractThinkingFromMessage(evt.message)

      if (thinkingContent && thinkingContent !== lastThinkingContent) {
        const newThinking = thinkingContent.slice(lastThinkingContent.length)
        if (newThinking) write({ type: 'thinking', content: newThinking })
        lastThinkingContent = thinkingContent
      }

      if (textContent && textContent !== lastTextContent) {
        const newText = textContent.slice(lastTextContent.length)
        if (newText) write({ type: 'text', content: newText })
        lastTextContent = textContent
      }

      // Capture inline image blocks if OpenClaw embeds them in chat events
      const images = extractImagesFromMessage(evt.message)
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

      const textContent = extractTextFromMessage(evt.message)
      const thinkingContent = extractThinkingFromMessage(evt.message)

      if (thinkingContent && thinkingContent !== lastThinkingContent) {
        const newThinking = thinkingContent.slice(lastThinkingContent.length)
        if (newThinking) write({ type: 'thinking', content: newThinking })
      }

      if (textContent && textContent !== lastTextContent) {
        const newText = textContent.slice(lastTextContent.length)
        if (newText) write({ type: 'text', content: newText })
      }

      // Capture any remaining inline image blocks from final message
      const images = extractImagesFromMessage(evt.message)
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
        .then(async () => {
          // Await saveLiveSnapshot BEFORE sending 'done' so that when the client
          // calls syncFromHistory (triggered by 'done'), liveMessages in the DB
          // already contain user-uploaded images and resolved MEDIA images.
          try {
            await saveLiveSnapshot(
              chatSessionId,
              client!,
              sessionKey,
              containerId,
              capturedImages,
              userImageAttachments,
            )
          } catch (err) {
            console.error('[live-snapshot] Save failed:', err)
          }
          write({ type: 'done' })
          cleanup()
        })
        .catch(async () => {
          try {
            await saveLiveSnapshot(
              chatSessionId,
              client!,
              sessionKey,
              containerId,
              capturedImages,
              userImageAttachments,
            )
          } catch {
            /* non-fatal */
          }
          write({ type: 'done' })
          cleanup()
        })
    } else if (state === 'error') {
      if (lifecycleEndTimer) {
        clearTimeout(lifecycleEndTimer)
        lifecycleEndTimer = null
      }
      activeRuns.delete(chatSessionId)
      write({
        type: 'error',
        error: String(evt.errorMessage ?? 'Unknown error'),
      })
      cleanup()
    } else if (state === 'aborted') {
      if (lifecycleEndTimer) {
        clearTimeout(lifecycleEndTimer)
        lifecycleEndTimer = null
      }
      activeRuns.delete(chatSessionId)
      write({ type: 'error', error: 'Conversation aborted' })
      cleanup()
    }
  })

  // Fallback timer: if agent lifecycle signals "end" but no chat "final"
  // arrives within 5 seconds, force-close the SSE stream.  This prevents
  // the loading-dots from spinning forever when the chat final event is
  // lost (WS reconnect, gateway race, etc.).
  let lifecycleEndTimer: ReturnType<typeof setTimeout> | null = null

  const unsubAgent = client.on('agent', (payload: unknown) => {
    if (closed) return
    const evt = payload as Record<string, unknown> | undefined
    if (!evt) return
    if (evt.runId !== idempotencyKey) return

    const stream = evt.stream as string | undefined

    // Use agent lifecycle "end"/"error" as a safety net for missing chat final
    if (stream === 'lifecycle') {
      const data = (evt.data ?? {}) as Record<string, unknown>
      const phase = data.phase as string
      if ((phase === 'end' || phase === 'error') && !lifecycleEndTimer) {
        lifecycleEndTimer = setTimeout(async () => {
          if (closed) return
          console.warn(
            `[chat/send] lifecycle ${phase} received but no chat final after 5s — forcing done (session=${chatSessionId})`,
          )
          activeRuns.delete(chatSessionId)
          try {
            await saveLiveSnapshot(
              chatSessionId,
              client!,
              sessionKey,
              containerId,
              capturedImages,
              userImageAttachments,
            )
          } catch {
            /* non-fatal */
          }
          write({ type: 'done' })
          cleanup()
        }, 5_000)
      }
    }

    if (stream === 'tool') {
      const data = (evt.data ?? {}) as Record<string, unknown>
      const phase = data.phase as string
      const toolName = String(data.name ?? 'tool')

      if (phase === 'start') {
        write({
          type: 'tool_call',
          toolName,
          toolInput: data.args ?? {},
        })
      } else if (phase === 'result') {
        write({
          type: 'tool_result',
          toolName,
          toolOutput: data.result ?? null,
        })

        // Detect image file paths in tool output (e.g. "MEDIA: /path/to/image.png")
        // and emit them as image SSE events
        const resultText = typeof data.result === 'string' ? data.result : ''
        const mediaPaths = extractMediaPaths(resultText)
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
    await close()
  }

  // --- Auto-attach session images + send message (runs in background) ---
  // Start async work WITHOUT blocking the SSE response. This ensures the
  // client gets the SSE connection immediately (no multi-second delay from
  // Docker exec operations like symlink creation, dir listing, and image download).
  ;(async () => {
    const sessionFileAttachments: { fileName: string; mimeType: string; content: string }[] = []
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
          where: { userId: user.id, instanceId, agentId, isActive: true },
        }))
      if (activeSession) {
        const instance = await prisma.instance.findUnique({
          where: { id: instanceId },
          select: { containerId: true, workspacePath: true },
        })
        containerId = instance?.containerId ?? null
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

    const mappedAttachments = [
      ...(attachments?.map((a) => ({
        fileName: a.name,
        mimeType: a.mimeType,
        content: a.content,
      })) ?? []),
      ...sessionFileAttachments,
    ]

    // Capture ONLY 📎 chat attachments for liveMessages persistence (not sidebar input/ files).
    // Session file attachments are sent to the agent via mappedAttachments but should NOT
    // appear as contentBlocks in chat message bubbles.
    for (const a of attachments ?? []) {
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
        const cur = await prisma.chatSession.findUnique({
          where: { id: chatSessionId },
          select: { liveMessages: true },
        })
        const live = (Array.isArray(cur?.liveMessages)
          ? cur!.liveMessages
          : []) as unknown as Record<string, unknown>[]
        live.push({
          id: randomUUID(),
          role: 'user',
          content: message,
          contentBlocks: imageBlocks,
          createdAt: new Date().toISOString(),
        })
        await prisma.chatSession.update({
          where: { id: chatSessionId },
          data: { liveMessages: live as unknown as Prisma.InputJsonValue },
        })
      } catch {
        // Non-fatal: saveLiveSnapshot will handle it at run end
      }
    }

    await adapter.sendMessage(client, sessionKey, message, idempotencyKey, {
      attachments: mappedAttachments.length > 0 ? mappedAttachments : undefined,
    })
    // Signal client that gateway has received the message — safe to start
    // progress polling for thinking/tool calls that aren't streamed via SSE.
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
