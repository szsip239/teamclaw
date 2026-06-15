import type { ChatContentBlock } from '@/types/chat'

const HISTORY_IMAGE_RE = /\/api\/v1\/chat\/sessions\/[^/?#]+\/images\/([^/?#]+)/

export function imageIdFromHistoryUrl(imageUrl: string | undefined): string | null {
  if (!imageUrl) return null

  const match = imageUrl.match(HISTORY_IMAGE_RE)
  if (!match?.[1]) return null

  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export function imageBlockDisplayKey(block: ChatContentBlock): string {
  if (block.type !== 'image') return `content:${block.type}:${block.text ?? ''}`

  const urlImageId = imageIdFromHistoryUrl(block.imageUrl)
  const imageId = urlImageId ?? block.imageId
  return imageId ? `image:${imageId}` : `image-url:${block.imageUrl ?? ''}`
}

export function uniqueImageBlocks(
  blocks: ChatContentBlock[] | undefined,
): ChatContentBlock[] {
  const seen = new Set<string>()
  const unique: ChatContentBlock[] = []

  for (const block of blocks ?? []) {
    if (block.type !== 'image' || !block.imageUrl) continue

    const key = imageBlockDisplayKey(block)
    if (seen.has(key)) continue

    unique.push(block)
    seen.add(key)
  }

  return unique
}
