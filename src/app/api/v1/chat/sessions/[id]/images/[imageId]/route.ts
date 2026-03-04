import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { computeImageId } from '@/lib/chat/image-helpers'
import type { ChatContentBlock } from '@/types/chat'

/**
 * Find a data URL image by its hash across an array of content-block sources.
 * Uses pre-computed block.imageId when available, falls back to computing the hash
 * for legacy data without imageId.
 */
function findImageInBlocks(
  sources: { contentBlocks?: unknown }[],
  targetHash: string,
): string | null {
  for (const source of sources) {
    if (!source.contentBlocks) continue
    const blocks = source.contentBlocks as unknown as ChatContentBlock[]
    if (!Array.isArray(blocks)) continue
    for (const block of blocks) {
      if (block.type !== 'image' || !block.imageUrl?.startsWith('data:')) continue
      if (block.imageId === targetHash) return block.imageUrl
      if (!block.imageId && computeImageId(block.imageUrl) === targetHash) return block.imageUrl
    }
  }
  return null
}

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
    if (Array.isArray(session.liveMessages)) {
      dataUrl = findImageInBlocks(
        session.liveMessages as unknown as { contentBlocks?: unknown }[],
        imageId,
      )
    }

    // 2. Fallback: search snapshots
    if (!dataUrl) {
      const snapshots = await prisma.chatMessageSnapshot.findMany({
        where: { chatSessionId: id },
        select: { contentBlocks: true },
      })
      dataUrl = findImageInBlocks(snapshots, imageId)
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
