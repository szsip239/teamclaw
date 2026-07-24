import { createReadStream } from 'node:fs'
import { writeFile, mkdir, rm, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { dirname, join, resolve, sep } from 'node:path'

const KB_DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data/knowledge-bases'
  : join(process.cwd(), 'data', 'knowledge-bases')

const RAG_OUTPUT_DIR = process.env.NODE_ENV === 'production'
  ? '/app/ingestion_output'
  : join(process.cwd(), 'data', 'rag-output')

// In dev mode, the RAG service runs in Docker with a bind mount:
//   ./data/knowledge-bases -> /app/data/knowledge-bases
// Translate the host path to the container path the RAG service sees.
const CONTAINER_KB_DIR = '/app/data/knowledge-bases'

/** Translate a host file path to the container path the RAG service sees. */
export function toContainerPath(hostPath: string): string {
  if (process.env.NODE_ENV === 'production') return hostPath
  return hostPath.replace(KB_DATA_DIR, CONTAINER_KB_DIR)
}

/** Save an uploaded file to the KB storage directory. Returns the absolute file path. */
export async function saveUploadedFile(kbId: string, fileName: string, buffer: Buffer): Promise<string> {
  const filePath = resolveUploadedFilePath(kbId, fileName)
  const dir = dirname(filePath)
  await mkdir(dir, { recursive: true })

  await writeFile(filePath, buffer)
  return filePath
}

export function sanitizeUploadedFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
}

/** Resolve the persisted upload that is retained independently of RAG artifacts. */
export function resolveUploadedFilePath(
  kbId: string,
  fileName: string,
  storageRoot = KB_DATA_DIR,
): string {
  const root = resolve(storageRoot)
  const uploadDir = resolve(root, kbId, 'uploads')
  const filePath = resolve(uploadDir, sanitizeUploadedFileName(fileName))

  if (
    (uploadDir !== root && !uploadDir.startsWith(`${root}${sep}`)) ||
    !filePath.startsWith(`${uploadDir}${sep}`)
  ) {
    throw new Error('Path traversal detected')
  }
  return filePath
}

export interface OpenedUploadedFile {
  body: ReadableStream<Uint8Array>
  status: 200 | 206
  size: number
  totalSize: number
  contentRange: string | null
}

/**
 * Open the original upload as a stream. This is the durable fallback when a
 * migrated or pruned RAG artifact volume no longer contains source.pdf.
 */
export async function openUploadedFile(
  kbId: string,
  fileName: string,
  rangeHeader: string | null,
  storageRoot = KB_DATA_DIR,
): Promise<OpenedUploadedFile | null> {
  const filePath = resolveUploadedFilePath(kbId, fileName, storageRoot)
  let fileStat
  try {
    fileStat = await stat(filePath)
  } catch {
    return null
  }
  if (!fileStat.isFile()) return null

  const range = parseByteRange(rangeHeader, fileStat.size)
  const stream = range
    ? createReadStream(filePath, { start: range.start, end: range.end })
    : createReadStream(filePath)

  return {
    body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
    status: range ? 206 : 200,
    size: range ? range.end - range.start + 1 : fileStat.size,
    totalSize: fileStat.size,
    contentRange: range ? `bytes ${range.start}-${range.end}/${fileStat.size}` : null,
  }
}

function parseByteRange(
  rangeHeader: string | null,
  totalSize: number,
): { start: number; end: number } | null {
  if (!rangeHeader || totalSize <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match || (!match[1] && !match[2])) return null

  if (!match[1]) {
    const suffixLength = Number(match[2])
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null
    return {
      start: Math.max(0, totalSize - suffixLength),
      end: totalSize - 1,
    }
  }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : totalSize - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= totalSize ||
    requestedEnd < start
  ) {
    return null
  }
  return { start, end: Math.min(requestedEnd, totalSize - 1) }
}

/** Get the file size in bytes. */
export async function getFileSize(filePath: string): Promise<number> {
  const s = await stat(filePath)
  return s.size
}

/** Delete all files for a specific document. */
export async function deleteDocumentFiles(kbId: string, docId: string): Promise<void> {
  const outputDir = join(KB_DATA_DIR, kbId, 'output', docId)
  const ragOutputDir = join(RAG_OUTPUT_DIR, kbId, docId)
  try {
    await rm(outputDir, { recursive: true, force: true })
  } catch {
    // Not found is fine
  }
  try {
    await rm(ragOutputDir, { recursive: true, force: true })
  } catch {
    // Not found is fine
  }
}

/** Delete the entire KB directory (uploads + output). */
export async function deleteKbDirectory(kbId: string): Promise<void> {
  const dir = join(KB_DATA_DIR, kbId)
  const ragOutputDir = join(RAG_OUTPUT_DIR, kbId)
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Not found is fine
  }
  try {
    await rm(ragOutputDir, { recursive: true, force: true })
  } catch {
    // Not found is fine
  }
}

/** Whether the persisted OCR Markdown exists for a document. */
export async function hasOcrDocument(kbId: string, docId: string): Promise<boolean> {
  try {
    await stat(join(RAG_OUTPUT_DIR, kbId, docId, 'document.md'))
    return true
  } catch {
    return false
  }
}

/** Resolve artifact path for the proxy endpoint. */
export function resolveArtifactPath(kbId: string, ...segments: string[]): string {
  const resolved = join(KB_DATA_DIR, kbId, 'output', ...segments)

  // Security: ensure resolved path is still within KB_DATA_DIR
  if (!resolved.startsWith(KB_DATA_DIR)) {
    throw new Error('Path traversal detected')
  }

  return resolved
}
