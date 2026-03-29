import { writeFile, mkdir, rm, stat } from 'fs/promises'
import { join } from 'path'

const KB_DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/app/data/knowledge-bases'
  : join(process.cwd(), 'data', 'knowledge-bases')

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
  try {
    await rm(outputDir, { recursive: true, force: true })
  } catch {
    // Not found is fine
  }
}

/** Delete the entire KB directory (uploads + output). */
export async function deleteKbDirectory(kbId: string): Promise<void> {
  const dir = join(KB_DATA_DIR, kbId)
  try {
    await rm(dir, { recursive: true, force: true })
  } catch {
    // Not found is fine
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
