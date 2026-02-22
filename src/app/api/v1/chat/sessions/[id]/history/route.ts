import { readFile } from 'fs/promises'
import { extname, resolve } from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { registry, ensureRegistryInitialized } from '@/lib/gateway/registry'
import type { ChatHistoryResult, ChatHistoryMessage } from '@/types/gateway'
import type { ChatMessage, ChatToolCall, ChatSnapshotBatch, ChatHistoryResponse, ChatContentBlock } from '@/types/chat'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
}

function extractMediaPaths(text: string): string[] {
  if (!text) return []
  const paths: string[] = []
  const mediaRegex = /MEDIA:\s*(\S+)/gi
  let match: RegExpExecArray | null
  while ((match = mediaRegex.exec(text)) !== null) {
    const p = match[1]
    if (p && IMAGE_EXTENSIONS.has(extname(p).toLowerCase())) paths.push(p)
  }
  const savedRegex = /Image saved:\s*(\S+)/gi
  while ((match = savedRegex.exec(text)) !== null) {
    const p = match[1]
    if (p && IMAGE_EXTENSIONS.has(extname(p).toLowerCase()) && !paths.includes(p)) paths.push(p)
  }
  return paths
}

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

function isAllowedImagePath(filePath: string): boolean {
  const resolved = resolve(filePath)
  return ALLOWED_IMAGE_DIRS.some(dir => resolved.startsWith(dir + '/'))
}

async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  try {
    if (!isAllowedImagePath(filePath)) return null
    const data = await readFile(filePath)
    if (data.byteLength > 10 * 1024 * 1024) return null
    const ext = extname(filePath).toLowerCase()
    const mime = MIME_BY_EXT[ext] || 'image/png'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Strip MEDIA:/Image saved:/file:/// references from assistant text.
 * These paths are only meaningful on the server — the actual images
 * are extracted separately and delivered as contentBlocks.
 */
function stripMediaReferences(text: string): string {
  return text
    .replace(/\n*MEDIA:\s*\S+/gi, '')
    .replace(/\n*Image saved:\s*\S+/gi, '')
    .replace(/!\[[^\]]*\]\(file:\/\/\/[^)]+\)/gi, '')
    .replace(/file:\/\/\/\S+?\.(?:png|jpg|jpeg|gif|webp|bmp)(?=[)\s\]"]|$)/gi, '')
    .trim()
}

function extractText(content: ChatHistoryMessage['content']): string {
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
 *
 * OpenClaw prepends "Conversation info (untrusted metadata): ... [timestamp]"
 * to user messages in chat.history. We extract the actual user text.
 *
 * Pattern:
 *   Conversation info (untrusted metadata):
 *   ```json
 *   { "message_id": "...", "sender": "..." }
 *   ```
 *   \n[Sat 2026-02-21 17:44 UTC] actual message
 */
function stripUserMetadata(text: string): string {
  // Match the metadata block ending with [timestamp] on a line
  const match = text.match(/\[[\w\s:+\-]+UTC\]\s*/)
  if (match && match.index !== undefined) {
    const after = text.slice(match.index + match[0].length)
    if (after) return after
  }
  return text
}

/**
 * Strip <final>...</final> wrapping from stored assistant messages.
 *
 * OpenClaw wraps the final assistant text in <final> tags in chat.history.
 * During streaming the tags are stripped, but history returns the raw format.
 */
function stripFinalTags(text: string): string {
  return text.replace(/<final>([\s\S]*?)<\/final>/g, '$1').trim()
}

function extractThinking(content: ChatHistoryMessage['content']): string {
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

/**
 * Collect all MEDIA: paths from tool results in the message list.
 * Used to batch-load images after initial message parsing.
 */
interface PendingImage { messageIndex: number; path: string }

function transformMessages(raw: ChatHistoryMessage[]): { messages: ChatMessage[]; pendingImages: PendingImage[] } {
  const result: ChatMessage[] = []
  const pendingImages: PendingImage[] = []

  for (const msg of raw) {
    if (msg.role === 'user') {
      const contentBlocks = extractContentBlocks(msg.content)
      result.push({
        id: crypto.randomUUID(),
        role: 'user',
        content: stripUserMetadata(extractText(msg.content)),
        ...(contentBlocks ? { contentBlocks } : {}),
        createdAt: new Date().toISOString(),
      })
    } else if (msg.role === 'assistant') {
      const rawText = extractText(msg.content)
      let text = stripFinalTags(stripMediaReferences(rawText))
      let thinking = extractThinking(msg.content)
      const contentBlocks = extractContentBlocks(msg.content)

      // Fallback: if model embedded response in thinking block (no text block)
      if (!text && thinking) {
        const split = splitThinkingFallback(thinking)
        if (split.text) {
          text = split.text
          thinking = split.thinking
        }
      }

      result.push({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: text,
        ...(contentBlocks ? { contentBlocks } : {}),
        ...(thinking ? { thinking } : {}),
        createdAt: new Date().toISOString(),
      })

      // Check for file:/// image paths in assistant text (use rawText before stripping)
      const filePaths = extractFileProtocolPaths(rawText)
      for (const p of filePaths) {
        pendingImages.push({ messageIndex: result.length - 1, path: p })
      }
    } else if (msg.role === 'toolResult') {
      const last = result[result.length - 1]
      if (last?.role === 'assistant') {
        const outputText = extractText(msg.content)
        const tc: ChatToolCall = {
          toolName: msg.toolName ?? 'tool',
          toolInput: null,
          toolOutput: outputText,
        }
        last.toolCalls = [...(last.toolCalls ?? []), tc]

        // Check for image paths in tool result
        const mediaPaths = extractMediaPaths(outputText)
        for (const p of mediaPaths) {
          pendingImages.push({ messageIndex: result.length - 1, path: p })
        }
      }
    }
  }
  return { messages: result, pendingImages }
}

// GET /api/v1/chat/sessions/[id]/history — load snapshots + current messages
export const GET = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少会话 ID' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({ where: { id } })

    if (!session) {
      return NextResponse.json({ error: '会话不存在' }, { status: 404 })
    }

    if (session.userId !== ctx.user.id) {
      return NextResponse.json({ error: '无权访问此会话' }, { status: 403 })
    }

    // 1. Load snapshot messages from DB
    const snapshotRows = await prisma.chatMessageSnapshot.findMany({
      where: { chatSessionId: id },
      orderBy: [{ createdAt: 'asc' }, { orderIndex: 'asc' }],
    })

    // 2. Group by batchId
    const batchMap = new Map<string, { createdAt: string; messages: ChatMessage[] }>()
    for (const row of snapshotRows) {
      if (!batchMap.has(row.batchId)) {
        batchMap.set(row.batchId, {
          createdAt: row.createdAt.toISOString(),
          messages: [],
        })
      }
      const batch = batchMap.get(row.batchId)!
      batch.messages.push({
        id: row.id,
        role: row.role as 'user' | 'assistant',
        content: row.content,
        ...(row.contentBlocks ? { contentBlocks: row.contentBlocks as unknown as ChatContentBlock[] } : {}),
        ...(row.thinking ? { thinking: row.thinking } : {}),
        ...(row.toolCalls ? { toolCalls: row.toolCalls as unknown as ChatToolCall[] } : {}),
        createdAt: row.createdAt.toISOString(),
      })
    }

    const snapshots: ChatSnapshotBatch[] = Array.from(batchMap.entries()).map(
      ([batchId, data]) => ({
        batchId,
        createdAt: data.createdAt,
        messages: data.messages,
      }),
    )

    // 3. If session is active, load current messages from OpenClaw
    let currentMessages: ChatMessage[] = []
    if (session.isActive) {
      try {
        await ensureRegistryInitialized()
        const client = registry.getClient(session.instanceId)
        if (client) {
          const sessionKey = `agent:${session.agentId}:tc:${session.userId}`
          const rawResult = await client.request('chat.history', {
            sessionKey,
            limit: 200,
          })
          const historyResult = rawResult as ChatHistoryResult
          const { messages: msgs, pendingImages } = transformMessages(historyResult.messages ?? [])

          // Load image files referenced in tool results
          if (pendingImages.length > 0) {
            const loaded = await Promise.all(
              pendingImages.map(async ({ messageIndex, path: p }) => ({
                messageIndex,
                dataUrl: await readImageAsDataUrl(p),
                mimeType: MIME_BY_EXT[extname(p).toLowerCase()] || 'image/png',
              })),
            )
            for (const { messageIndex, dataUrl, mimeType } of loaded) {
              if (!dataUrl) continue
              const msg = msgs[messageIndex]
              if (msg?.role === 'assistant') {
                const blocks: ChatContentBlock[] = [...(msg.contentBlocks ?? [])]
                blocks.push({ type: 'image', imageUrl: dataUrl, mimeType })
                msg.contentBlocks = blocks
              }
            }
          }

          currentMessages = msgs
        }
      } catch {
        // Gateway offline — return snapshots only
      }
    }

    const response: ChatHistoryResponse = {
      snapshots,
      currentMessages,
      isActive: session.isActive,
    }

    return NextResponse.json(response)
  }),
)
