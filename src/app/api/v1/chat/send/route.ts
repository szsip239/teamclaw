import { randomUUID } from 'crypto'
import { readFile } from 'fs/promises'
import { extname, resolve } from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import { sendMessageSchema } from '@/lib/validations/chat'
import { verifyAccessToken } from '@/lib/auth/jwt'
import { dockerManager } from '@/lib/docker/manager'
import { buildSessionInputPath, buildSessionOutputPath, buildCurrentSessionLinkPath, buildCurrentSessionTarget } from '@/lib/session-files/helpers'
import type { ChatStreamEvent, ChatContentBlock } from '@/types/chat'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type { ChatToolCall } from '@/types/chat'
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

function extractContentBlocks(content: ChatHistoryMessage['content']): ChatContentBlock[] | undefined {
  if (!Array.isArray(content)) return undefined
  const blocks: ChatContentBlock[] = []
  for (const block of content) {
    if (block.type === 'image') {
      let imageUrl = ''
      if (block.source?.type === 'base64' && block.source.data) {
        imageUrl = `data:${block.source.media_type || 'image/png'};base64,${block.source.data}`
      } else if (block.url) {
        imageUrl = block.url
      }
      if (imageUrl) {
        blocks.push({ type: 'image', imageUrl, mimeType: block.source?.media_type })
      }
    }
  }
  return blocks.length > 0 ? blocks : undefined
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
}

/**
 * Extract MEDIA: paths from tool output text.
 * OpenClaw skills output lines like: "MEDIA: /path/to/image.png"
 * Also handles "Image saved: /path/to/image.png" patterns.
 */
function extractMediaPaths(toolOutput: unknown): string[] {
  const text = typeof toolOutput === 'string'
    ? toolOutput
    : typeof toolOutput === 'object' && toolOutput !== null
      ? JSON.stringify(toolOutput)
      : ''
  if (!text) return []

  const paths: string[] = []
  // Match "MEDIA: /path" or "MEDIA:/path" patterns
  const mediaRegex = /MEDIA:\s*(\S+)/gi
  let match: RegExpExecArray | null
  while ((match = mediaRegex.exec(text)) !== null) {
    const p = match[1]
    if (p && IMAGE_EXTENSIONS.has(extname(p).toLowerCase())) {
      paths.push(p)
    }
  }
  // Match "Image saved: /path" patterns
  const savedRegex = /Image saved:\s*(\S+)/gi
  while ((match = savedRegex.exec(text)) !== null) {
    const p = match[1]
    if (p && IMAGE_EXTENSIONS.has(extname(p).toLowerCase())) {
      if (!paths.includes(p)) paths.push(p)
    }
  }
  return paths
}

/**
 * Extract file:/// image paths from text content.
 * AI may embed local file references in markdown format: ![alt](file:///path/to/image.png)
 * or as plain file:///path/to/image.png references.
 */
function extractFileProtocolPaths(text: string): string[] {
  if (!text) return []
  const paths: string[] = []
  const fileRegex = /file:\/\/\/([\S]+?\.(?:png|jpg|jpeg|gif|webp|bmp))(?:[)\s\]"]|$)/gi
  let match: RegExpExecArray | null
  while ((match = fileRegex.exec(text)) !== null) {
    const p = '/' + match[1]
    if (!paths.includes(p)) paths.push(p)
  }
  return paths
}

/** Allowed base directories for reading image files from the host */
const ALLOWED_IMAGE_DIRS = ['/tmp', '/home']

/**
 * Check if a file path is within an allowed directory.
 * Prevents arbitrary file reads from AI-generated paths.
 */
function isAllowedImagePath(filePath: string): boolean {
  const resolved = resolve(filePath)
  return ALLOWED_IMAGE_DIRS.some(dir => resolved.startsWith(dir + '/'))
}

/**
 * Read a local image file and return as base64 data URL.
 * Returns null if the file can't be read, is too large (>10MB),
 * or is outside allowed directories.
 */
async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  try {
    if (!isAllowedImagePath(filePath)) return null
    const data = await readFile(filePath)
    if (data.byteLength > 10 * 1024 * 1024) return null // 10MB limit
    const ext = extname(filePath).toLowerCase()
    const mime = MIME_BY_EXT[ext] || 'image/png'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

function extractHistoryText(content: ChatHistoryMessage['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && block.text) parts.push(block.text)
  }
  return parts.join('\n').trim()
}

/**
 * Strip OpenClaw delivery metadata from stored user messages.
 * OpenClaw prepends "Conversation info ... [timestamp]" to user messages
 * in chat.history. Extract the actual user text after the timestamp line.
 */
function stripUserMetadata(text: string): string {
  const match = text.match(/\[[\w\s:+\-]+UTC\]\s*/)
  if (match && match.index !== undefined) {
    const after = text.slice(match.index + match[0].length)
    if (after) return after
  }
  return text
}

/**
 * Strip <final>...</final> wrapping from stored assistant messages.
 * OpenClaw wraps final text in <final> tags in chat.history storage.
 */
function stripFinalTags(text: string): string {
  return text.replace(/<final>([\s\S]*?)<\/final>/g, '$1').trim()
}

function extractHistoryThinking(content: ChatHistoryMessage['content']): string {
  if (typeof content === 'string') return ''
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'thinking' && block.thinking) parts.push(block.thinking)
  }
  return parts.join('\n').trim()
}

/**
 * Fallback: extract response text embedded in thinking blocks.
 *
 * MiniMax models output `<think>...</think>` internally; the Anthropic-compatible
 * API layer is supposed to parse these into separate content blocks. When parsing
 * fails, the response text leaks into the thinking block in two known patterns:
 *
 * 1. Complete API failure: raw `<think>reasoning</think>response` in one block
 * 2. Partial API failure: thinking block contains reasoning + ZWJ (U+200D) + response
 *    (API stripped the tags but didn't create a separate text block)
 * 3. Ultimate fallback: show full thinking as content (better than empty)
 */
function splitThinkingFallback(thinking: string): { thinking: string; text: string } {
  // Strategy 1: <think> tags still present (complete API parsing failure)
  const thinkMatch = thinking.match(/^<think>([\s\S]*?)<\/think>([\s\S]*)$/)
  if (thinkMatch) {
    const extractedThinking = thinkMatch[1].trim()
    const extractedText = thinkMatch[2].trim()
    if (extractedText.length >= 2) {
      return { thinking: extractedThinking, text: extractedText }
    }
  }

  // Strategy 2: ZWJ separator (partial API failure — tags stripped, blocks not split)
  const zwjIndex = thinking.lastIndexOf('\u200D')
  if (zwjIndex !== -1) {
    const before = thinking.slice(0, zwjIndex).trim()
    const after = thinking.slice(zwjIndex + 1).trim()
    if (after.length >= 2) {
      return { thinking: before, text: after }
    }
  }

  // Strategy 3: use full thinking as content (better than showing nothing)
  return { thinking: '', text: thinking }
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
  // Find current active session
  const activeSession = await prisma.chatSession.findFirst({
    where: { userId, instanceId, agentId, isActive: true },
  })

  if (activeSession && activeSession.id !== targetSessionId) {
    // Snapshot the active session's messages
    await ensureRegistryInitialized()
    const client = registry.getClient(instanceId)

    if (client) {
      try {
        const rawResult = await client.request('chat.history', {
          sessionKey,
          limit: 200,
        })
        const historyResult = rawResult as ChatHistoryResult
        const rawMessages = historyResult.messages ?? []

        if (rawMessages.length > 0) {
          const batchId = randomUUID()
          let orderIndex = 0
          const snapshotData: Prisma.ChatMessageSnapshotCreateManyInput[] = []
          let firstUserMessage: string | null = null

          for (const msg of rawMessages) {
            if (msg.role === 'user') {
              const text = stripUserMetadata(extractHistoryText(msg.content))
              const cb = extractContentBlocks(msg.content)
              if (!firstUserMessage && text) firstUserMessage = text
              snapshotData.push({
                chatSessionId: activeSession.id,
                batchId,
                orderIndex: orderIndex++,
                role: 'user',
                content: text,
                contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
              })
            } else if (msg.role === 'assistant') {
              let text = stripFinalTags(extractHistoryText(msg.content))
              let thinking = extractHistoryThinking(msg.content)
              const cb = extractContentBlocks(msg.content)
              const toolCalls: ChatToolCall[] = []

              // Fallback: if model embedded response in thinking block
              if (!text && thinking) {
                const split = splitThinkingFallback(thinking)
                if (split.text) {
                  text = split.text
                  thinking = split.thinking
                }
              }

              snapshotData.push({
                chatSessionId: activeSession.id,
                batchId,
                orderIndex: orderIndex++,
                role: 'assistant',
                content: text,
                contentBlocks: cb ? (cb as unknown as Prisma.InputJsonValue) : undefined,
                thinking: thinking || null,
                toolCalls: toolCalls.length > 0 ? (toolCalls as unknown as Prisma.InputJsonValue) : undefined,
              })
            } else if (msg.role === 'toolResult') {
              const lastSnapshot = snapshotData[snapshotData.length - 1]
              if (lastSnapshot?.role === 'assistant') {
                const existing = (lastSnapshot.toolCalls as unknown as ChatToolCall[] | null) ?? []
                existing.push({
                  toolName: msg.toolName ?? 'tool',
                  toolInput: null,
                  toolOutput: extractHistoryText(msg.content),
                })
                lastSnapshot.toolCalls = existing as unknown as Prisma.InputJsonValue
              }
            }
          }

          if (snapshotData.length > 0) {
            await prisma.chatMessageSnapshot.createMany({ data: snapshotData })
          }

          if (!activeSession.title && firstUserMessage) {
            await prisma.chatSession.update({
              where: { id: activeSession.id },
              data: { title: firstUserMessage.slice(0, 50) },
            })
          }
        }

        // Delete OpenClaw session
        await client.request('sessions.delete', { key: sessionKey })
      } catch {
        // Gateway offline — continue with DB operations
      }
    }

    // Deactivate old session
    await prisma.chatSession.update({
      where: { id: activeSession.id },
      data: { isActive: false },
    })
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
      return NextResponse.json({ error: '未授权访问' }, { status: 401 })
    }

    const payload = await verifyAccessToken(token)
    if (!payload) {
      return NextResponse.json({ error: '无效或过期的令牌' }, { status: 401 })
    }

    userId = payload.userId
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, departmentId: true, status: true },
  })

  if (!user || user.status !== 'ACTIVE') {
    return NextResponse.json({ error: '用户不存在或已禁用' }, { status: 401 })
  }

  const userRole = user.role // Always use DB role, never trust header

  // --- Validate body ---
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '请求体格式错误' }, { status: 400 })
  }

  const parsed = sendMessageSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '参数验证失败', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { instanceId, agentId, message, sessionId: targetSessionId, attachments } = parsed.data

  // --- Permission check ---
  if (userRole !== 'SYSTEM_ADMIN') {
    if (!user.departmentId) {
      return NextResponse.json({ error: '无权访问此 Agent' }, { status: 403 })
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
      return NextResponse.json({ error: '无权访问此实例' }, { status: 403 })
    }

    // Layer 2: Agent classification visibility
    const agentMeta = await prisma.agentMeta.findUnique({
      where: { instanceId_agentId: { instanceId, agentId } },
    })

    if (agentMeta) {
      const { isAgentVisible } = await import('@/lib/agents/helpers')
      const authUser = { id: user.id, role: userRole ?? user.role, departmentId: user.departmentId, name: '', email: '', departmentName: null, avatar: null }
      if (!isAgentVisible(agentMeta, authUser)) {
        return NextResponse.json({ error: '无权访问此 Agent' }, { status: 403 })
      }
    } else {
      // Fallback: legacy agentIds check from InstanceAccess
      const allowedIds = access.agentIds as string[] | null
      if (allowedIds && !allowedIds.includes(agentId)) {
        return NextResponse.json({ error: '无权访问此 Agent' }, { status: 403 })
      }
    }
  }

  // --- Ensure registry ---
  await ensureRegistryInitialized()

  const client = registry.getClient(instanceId)
  const adapter = registry.getAdapter(instanceId)
  if (!client || !adapter) {
    return NextResponse.json({ error: '实例未连接' }, { status: 502 })
  }

  // --- Build session key ---
  const sessionKey = `agent:${agentId}:tc:${user.id}`
  const idempotencyKey = randomUUID()

  // --- Handle session switching if targeting a specific (possibly inactive) session ---
  if (targetSessionId) {
    const targetSession = await prisma.chatSession.findUnique({
      where: { id: targetSessionId },
    })
    if (targetSession && targetSession.userId === user.id && !targetSession.isActive) {
      await switchActiveSession(user.id, instanceId, agentId, targetSessionId, sessionKey)
    }
  }

  // --- Find or create ChatSession ---
  const existingSession = await prisma.chatSession.findFirst({
    where: { userId: user.id, instanceId, agentId, isActive: true },
  })

  if (existingSession) {
    await prisma.chatSession.update({
      where: { id: existingSession.id },
      data: {
        sessionId: sessionKey,
        lastMessageAt: new Date(),
        messageCount: { increment: 1 },
      },
    })
  } else {
    await prisma.chatSession.create({
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
  }

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
        cleanup()
      }).catch(() => {
        write({ type: 'done' })
        cleanup()
      })
    } else if (state === 'error') {
      write({
        type: 'error',
        error: String(evt.errorMessage ?? '未知错误'),
      })
      cleanup()
    } else if (state === 'aborted') {
      write({ type: 'error', error: '对话已中止' })
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
        const mediaPaths = extractMediaPaths(data.result)
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
        const inputPath = buildSessionInputPath(agentId, user.id, activeSession.id)

        // Update `current-session` symlink so the agent can find files via
        // `current-session/input/` without needing injected paths.
        // Also ensure output/ directory exists so the agent can write results.
        try {
          const linkPath = buildCurrentSessionLinkPath(agentId)
          const target = buildCurrentSessionTarget(user.id, activeSession.id)
          const outputPath = buildSessionOutputPath(agentId, user.id, activeSession.id)
          await Promise.all([
            dockerManager.execInContainer(instance.containerId, [
              'ln', '-sfn', '--', target, linkPath,
            ]),
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
          const ext = ('.' + f.name.split('.').pop()!).toLowerCase()
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
      write({ type: 'error', error: err.message || '发送消息失败' })
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
