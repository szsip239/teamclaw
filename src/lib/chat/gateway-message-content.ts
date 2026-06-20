import { extractMediaPaths } from './image-helpers'

export interface ExtractedGatewayImage {
  url: string
  mimeType?: string
  alt?: string
}

function messageContent(message: unknown): unknown {
  if (!message || typeof message !== 'object') return undefined
  return (message as Record<string, unknown>).content
}

export function extractTextFromGatewayMessage(message: unknown): string {
  const content = messageContent(message)
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type === 'text' && typeof record.text === 'string') {
      parts.push(record.text)
    }
  }
  return parts.join('\n').trim()
}

export function extractThinkingFromGatewayMessage(message: unknown): string {
  const content = messageContent(message)
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type === 'thinking' && typeof record.thinking === 'string') {
      parts.push(record.thinking)
    }
  }
  return parts.join('\n').trim()
}

export function extractImagesFromGatewayMessage(message: unknown): ExtractedGatewayImage[] {
  const content = messageContent(message)
  if (!Array.isArray(content)) return []
  const images: ExtractedGatewayImage[] = []

  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type !== 'image') continue

    let imageUrl = ''
    const source = record.source as Record<string, unknown> | undefined
    if (source?.type === 'base64' && typeof source.data === 'string') {
      const mediaType = (source.media_type as string) || 'image/png'
      imageUrl = `data:${mediaType};base64,${source.data}`
    } else if (typeof record.url === 'string') {
      imageUrl = record.url
    }

    if (imageUrl) {
      images.push({
        url: imageUrl,
        mimeType: source?.media_type as string | undefined,
        alt: typeof record.alt === 'string' ? record.alt : undefined,
      })
    }
  }

  return images
}

export function extractMediaPathsFromGatewayToolResults(
  messages: Array<{ role?: string; content?: unknown }>,
  options: { tailCount?: number } = {},
): string[] {
  const allPaths: string[] = []
  const tailCount = options.tailCount ?? 20

  for (const message of messages.slice(-tailCount)) {
    if (message.role !== 'toolResult') continue
    const text = extractTextFromGatewayMessage(message)
    allPaths.push(...extractMediaPaths(text))
  }

  return [...new Set(allPaths)]
}
