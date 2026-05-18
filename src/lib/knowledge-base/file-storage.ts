import { writeFile, mkdir, rm, stat } from 'fs/promises'
import { join } from 'path'

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
  const dir = join(KB_DATA_DIR, kbId, 'uploads')
  await mkdir(dir, { recursive: true })

  // Sanitize filename — prevent path traversal
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = join(dir, safe)

  await writeFile(filePath, buffer)
  return filePath
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
