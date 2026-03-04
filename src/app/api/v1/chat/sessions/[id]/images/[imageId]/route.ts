import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { computeImageId } from '@/lib/chat/image-helpers'
import type { ChatMessage, ChatContentBlock } from '@/types/chat'

/**
 * Find an image data URL by its ID in an array of messages.
 * Uses pre-computed block.imageId when available (fast path),
 * falls back to computing the hash for legacy data without imageId.
 */
function findImageInMessages(
  messages: ChatMessage[],
  targetHash: string,
): string | null {
  for (const msg of messages) {
    if (!msg.contentBlocks) continue
    for (const block of msg.contentBlocks) {
      if (block.type !== 'image' || !block.imageUrl?.startsWith('data:')) continue
      // Fast path: pre-computed imageId
      if (block.imageId === targetHash) return block.imageUrl
      // Legacy fallback: compute hash on the fly
      if (!block.imageId && computeImageId(block.imageUrl) === targetHash) return block.imageUrl
    }
  }
  return null
}

/**
 * Find an image in snapshot contentBlocks.
 * Same dual-path logic: check block.imageId first, then compute hash.
 */
function findImageInSnapshots(
  snapshots: { contentBlocks: unknown }[],
  targetHash: string,
): string | null {
  for (const snap of snapshots) {
    if (!snap.contentBlocks) continue
    const blocks = snap.contentBlocks as unknown as ChatContentBlock[]
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (block.type !== 'image' || !block.imageUrl?.startsWith('data:')) continue
      if (block.imageId === targetHash) return block.imageUrl
      if (!block.imageId && computeImageId(block.imageUrl) === targetHash) return block.imageUrl
    }
  }
  return null
}

/**
 * Parse a data URL into its MIME type and binary buffer.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) throw new Error('Invalid data URL')
  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

// GET /api/v1/chat/sessions/[id]/images/[imageId]
export const GET = withAuth(
  withPermission('chat:use', async (_req, ctx) => {
    const id = param(ctx, 'id')
    const imageId = param(ctx, 'imageId')
    if (!id || !imageId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const session = await prisma.chatSession.findUnique({
      where: { id },
      select: { userId: true, liveMessages: true },
    })

    if (!session || session.userId !== ctx.user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // 1. Search liveMessages
    let dataUrl: string | null = null
    if (session.liveMessages) {
      const live = session.liveMessages as unknown as ChatMessage[]
      if (Array.isArray(live)) {
        dataUrl = findImageInMessages(live, imageId)
      }
    }

    // 2. Fallback: search snapshots
    if (!dataUrl) {
      const snapshots = await prisma.chatMessageSnapshot.findMany({
        where: { chatSessionId: id },
        select: { contentBlocks: true },
      })
      dataUrl = findImageInSnapshots(snapshots, imageId)
    }

    if (!dataUrl) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const { mimeType, buffer } = parseDataUrl(dataUrl)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    })
  }),
)
