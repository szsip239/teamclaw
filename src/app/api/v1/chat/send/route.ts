import { randomUUID } from 'crypto'
import { extname } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { sendMessageSchema } from '@/lib/validations/chat'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { dockerManager } from '@/lib/docker/manager'
import { buildSessionInputPath, buildSessionOutputPath, buildCurrentSessionLinkPath, buildCurrentSessionTarget } from '@/lib/session-files/helpers'
import { archiveSession, saveLiveSnapshot, extractContentBlocks } from '@/lib/chat/snapshot-helpers'
import { MIME_BY_EXT, extractMediaPaths, extractFileProtocolPaths, readImageAsDataUrl } from '@/lib/chat/image-helpers'
import type { ChatStreamEvent, ChatContentBlock } from '@/types/chat'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
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
      await archiveSession(activeSession.id, instanceId, agentId, userId, client)
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
      const authUser = { id: user.id, role: userRole ?? user.role, departmentId: user.departmentId, name: '', email: '', departmentName: null, avatar: null }
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

  function write(event: ChatStreamEvent) {
    if (closed) return
    writer.write(encoder.encode(encodeSSE(event))).catch(() => {
      closed = true
    })
  }

  // Send session ID as the first event so the frontend can track this session
  write({ type: 'session', sessionId: chatSessionId })

  async function close() {
    if (closed) return
    // Wait for any pending image reads to complete before closing
    if (pendingImageReads.length > 0) {
      await Promise.allSettled(pendingImageReads)
    }
    closed = true
    writer.close().catch(() => {})
  }

  /**
   * After streaming ends, fetch chat.history to find generated images.
   * Gateway doesn't emit tool agent events, so images in tool results
   * (e.g. MEDIA: paths from exec/process tools) are only visible via history.
   * Also checks the final text for file:/// embedded paths.
   */
  async function fetchAndEmitImages(finalText: string) {
    const allPaths: string[] = []

    // 1. Check final text for file:/// paths
    allPaths.push(...extractFileProtocolPaths(finalText))

    // 2. Fetch chat.history and scan tool results for MEDIA: paths
    try {
      const rawResult = await client!.request('chat.history', {
        sessionKey,
        limit: 50,
      }, 10_000) // 10s timeout for history fetch
      const historyResult = rawResult as ChatHistoryResult
      const messages = historyResult.messages ?? []

      // Scan only the last few messages (this run's output)
      for (const msg of messages.slice(-10)) {
        if (msg.role === 'toolResult') {
          const text = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.filter((b: Record<string, unknown>) => b.type === 'text').map((b: Record<string, unknown>) => b.text).join('\n')
              : ''
          allPaths.push(...extractMediaPaths(text))
        }
        if (msg.role === 'assistant') {
          const text = typeof msg.content === 'string'
            ? msg.content
            : Array.isArray(msg.content)
              ? msg.content.filter((b: Record<string, unknown>) => b.type === 'text').map((b: Record<string, unknown>) => b.text).join('\n')
              : ''
          allPaths.push(...extractFileProtocolPaths(text))
          allPaths.push(...extractMediaPaths(text))
        }
      }
    } catch {
      // History fetch failed — fall through with whatever paths we found
    }

    // 3. Deduplicate and read images
    const uniquePaths = [...new Set(allPaths)]
    if (uniquePaths.length > 0) {
      await Promise.all(
        uniquePaths.map(async (p) => {
          const dataUrl = await readImageAsDataUrl(p)
          if (dataUrl) {
            const ext = extname(p).toLowerCase()
            write({ type: 'image', imageUrl: dataUrl, mimeType: MIME_BY_EXT[ext] })
          }
        }),
      )
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

      // Emit new image blocks
      const images = extractImagesFromMessage(evt.message)
      for (let i = lastImageCount; i < images.length; i++) {
        write({ type: 'image', imageUrl: images[i].url, mimeType: images[i].mimeType, alt: images[i].alt })
      }
      lastImageCount = images.length
    } else if (state === 'final') {
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

      // Emit any remaining image blocks from final message content
      const images = extractImagesFromMessage(evt.message)
      for (let i = lastImageCount; i < images.length; i++) {
        write({ type: 'image', imageUrl: images[i].url, mimeType: images[i].mimeType, alt: images[i].alt })
      }

      // After streaming completes, fetch chat.history to find images in tool results.
      // Gateway doesn't emit tool agent events, so we must check history for MEDIA:/file:///paths.
      fetchAndEmitImages(textContent).then(() => {
        write({ type: 'done' })
        // Post-run auto-snapshot (fire-and-forget)
        saveLiveSnapshot(chatSessionId, client!, sessionKey).catch((err) =>
          console.error('[live-snapshot] Save failed:', err),
        )
        cleanup()
      }).catch(() => {
        write({ type: 'done' })
        saveLiveSnapshot(chatSessionId, client!, sessionKey).catch(() => {})
        cleanup()
      })
    } else if (state === 'error') {
      write({
        type: 'error',
        error: String(evt.errorMessage ?? 'Unknown error'),
      })
      cleanup()
    } else if (state === 'aborted') {
      write({ type: 'error', error: 'Conversation aborted' })
      cleanup()
    }
  })

  const unsubAgent = client.on('agent', (payload: unknown) => {
    if (closed) return
    const evt = payload as Record<string, unknown> | undefined
    if (!evt) return
    if (evt.runId !== idempotencyKey) return

    const stream = evt.stream as string | undefined

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
              const dataUrl = await readImageAsDataUrl(p)
              if (dataUrl) {
                const ext = extname(p).toLowerCase()
                write({ type: 'image', imageUrl: dataUrl, mimeType: MIME_BY_EXT[ext] })
              }
            }),
          ).then(() => {}).catch(() => {})
          pendingImageReads.push(imageReadPromise)
        }
      }
    }
  })

  async function cleanup() {
    unsubChat()
    unsubAgent()
    await close()
  }

  // --- Auto-attach session images as base64 (non-blocking, no text injection) ---
  const finalMessage = message
  const sessionFileAttachments: { fileName: string; mimeType: string; content: string }[] = []
  const SESSION_IMAGE_EXTS: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
  }
  const SESSION_IMAGE_MAX = 5 * 1024 * 1024 // 5MB per image for attachment
  try {
    const activeSession = existingSession ?? await prisma.chatSession.findFirst({
      where: { userId: user.id, instanceId, agentId, isActive: true },
    })
    if (activeSession) {
      const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: { containerId: true },
      })
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
              'ln', '-sfn', '--', target, linkPath,
            ]),
            dockerManager.ensureContainerDir(instance.containerId, inputPath),
            dockerManager.ensureContainerDir(instance.containerId, outputPath),
          ])
        } catch {
          // Non-fatal: symlink/mkdir failure doesn't block chat
        }

        let inputFiles: { name: string; path: string; type: string; size: number }[] = []
        try { inputFiles = await dockerManager.listContainerDir(instance.containerId, inputPath) } catch {}

        // Auto-attach images from input/ as base64 attachments so the model can see them.
        // No text injection — session file rules and discovery are handled by AGENTS.md.
        for (const f of inputFiles) {
          if (f.type !== 'file' || f.size > SESSION_IMAGE_MAX) continue
          const ext = ('.' + (f.name.split('.').pop() ?? '')).toLowerCase()
          const mime = SESSION_IMAGE_EXTS[ext]
          if (!mime) continue
          try {
            const filePath = `${inputPath}${f.name}`
            const buf = await dockerManager.downloadFileFromContainer(instance.containerId, filePath)
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
    ...(attachments?.map(a => ({ fileName: a.name, mimeType: a.mimeType, content: a.content })) ?? []),
    ...sessionFileAttachments,
  ]

  adapter
    .sendMessage(client, sessionKey, finalMessage, idempotencyKey, {
      attachments: mappedAttachments.length > 0 ? mappedAttachments : undefined,
    })
    .catch((err: Error) => {
      write({ type: 'error', error: err.message || 'Failed to send message' })
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
