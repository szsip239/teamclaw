import { readFile } from 'fs/promises'
import { extname, resolve } from 'path'
import { dockerManager } from '@/lib/docker/manager'

// ─── Image constants ─────────────────────────────────────────────────

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])

export const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024

// ─── Path extraction ─────────────────────────────────────────────────

/**
 * Extract MEDIA: paths from tool output text.
 * OpenClaw skills output lines like: "MEDIA: /path/to/image.png"
 * Also handles "Image saved: /path/to/image.png" patterns.
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

/**
 * Extract file:/// image paths from text content.
 * AI may embed local file references in markdown format: ![alt](file:///path/to/image.png)
 * or as plain file:///path/to/image.png references.
 */
export function extractFileProtocolPaths(text: string): string[] {
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

// ─── Image file reading ──────────────────────────────────────────────

/** Allowed base directories for reading image files from the host.
 *  Covers Linux (/tmp, /home), macOS (/Users), and any extra dirs via env. */
const ALLOWED_IMAGE_DIRS = [
  '/tmp', '/home', '/Users',
  ...(process.env.IMAGE_ALLOWED_DIRS?.split(':').filter(Boolean) ?? []),
]

/**
 * Check if a file path is within an allowed directory.
 * Prevents arbitrary file reads from AI-generated paths.
 */
export function isAllowedImagePath(filePath: string): boolean {
  const resolved = resolve(filePath)
  return ALLOWED_IMAGE_DIRS.some(dir => resolved.startsWith(dir + '/'))
}

/**
 * Convert a Buffer to a base64 data URL.
 * Returns null if the buffer exceeds the max size.
 */
export function bufferToDataUrl(buf: Buffer, filePath: string): string | null {
  if (buf.byteLength > IMAGE_MAX_BYTES) return null
  const ext = extname(filePath).toLowerCase()
  const mime = MIME_BY_EXT[ext] || 'image/png'
  return `data:${mime};base64,${buf.toString('base64')}`
}

/**
 * Read a local image file and return as base64 data URL.
 * Returns null if the file can't be read, is too large (>10MB),
 * or is outside allowed directories.
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
