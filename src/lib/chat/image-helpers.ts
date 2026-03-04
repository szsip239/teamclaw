import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { extname, resolve } from 'path'
import { dockerManager } from '@/lib/docker/manager'
import type { ChatMessage } from '@/types/chat'

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])

export const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024

/** Allowed base directories for reading image files from the host. */
const ALLOWED_IMAGE_DIRS = [
  '/tmp', '/home', '/Users',
  ...(process.env.IMAGE_ALLOWED_DIRS?.split(':').filter(Boolean) ?? []),
]

/**
 * Compute a short stable ID for an image data URL.
 * Uses SHA-256 of the first 500 chars + total length → 16 hex chars.
 */
export function computeImageId(dataUrl: string): string {
  return createHash('sha256')
    .update(dataUrl.slice(0, 500) + ':' + dataUrl.length)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Stamp imageId on all image contentBlocks in a message array.
 * Pre-computing the hash at storage time avoids re-hashing on every image request.
 * Mutates in place.
 */
export function stampImageIds(messages: ChatMessage[]): void {
  for (const msg of messages) {
    if (!msg.contentBlocks) continue
    for (const block of msg.contentBlocks) {
      if (block.type === 'image' && block.imageUrl?.startsWith('data:') && !block.imageId) {
        block.imageId = computeImageId(block.imageUrl)
      }
    }
  }
}

/**
 * Extract MEDIA: and "Image saved:" paths from tool output text.
 * OpenClaw skills output lines like: "MEDIA: /path/to/image.png"
 */
export function extractMediaPaths(text: string): string[] {
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

export function isAllowedImagePath(filePath: string): boolean {
  const resolved = resolve(filePath)
  return ALLOWED_IMAGE_DIRS.some(dir => resolved.startsWith(dir + '/'))
}

export function bufferToDataUrl(buf: Buffer, filePath: string): string | null {
  if (buf.byteLength > IMAGE_MAX_BYTES) return null
  const ext = extname(filePath).toLowerCase()
  const mime = MIME_BY_EXT[ext] || 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Read a local image file and return as base64 data URL.
 * Returns null if the file can't be read, is too large, or is outside allowed directories.
 * Used for external instances (no containerId).
 */
export async function readImageAsDataUrl(filePath: string): Promise<string | null> {
  try {
    if (!isAllowedImagePath(filePath)) return null
    const data = await readFile(filePath)
    return bufferToDataUrl(data, filePath)
  } catch {
    return null
  }
}

/**
 * Read an image from a Docker container's filesystem and return as base64 data URL.
 * Used for container instances where host fs.readFile cannot access the file.
 */
export async function readContainerImageAsDataUrl(
  containerId: string,
  filePath: string,
): Promise<string | null> {
  try {
    const data = await dockerManager.downloadFileFromContainer(containerId, filePath)
    return bufferToDataUrl(data, filePath)
  } catch {
    return null
  }
}
