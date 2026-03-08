import * as fs from 'fs/promises'
import * as path from 'path'
import { spawn } from 'child_process'
import type { SessionFileEntry } from '@/types/session-files'

/**
 * Guard: ensure the resolved path stays within the declared workspacePath.
 * Prevents path traversal attacks on the host filesystem.
 */
function assertWithinWorkspace(filePath: string, workspacePath: string): void {
  const resolved = path.resolve(filePath)
  const base = path.resolve(workspacePath)
  if (!resolved.startsWith(base + '/') && resolved !== base) {
    throw new Error('Path traversal detected')
  }
}

export async function listDir(dirPath: string, workspacePath: string): Promise<SessionFileEntry[]> {
  assertWithinWorkspace(dirPath, workspacePath)
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const results: SessionFileEntry[] = []
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    try {
      const stat = await fs.stat(fullPath)
      results.push({
        name: entry.name,
        path: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: stat.size,
      })
    } catch {
      // Skip entries we can't stat
    }
  }
  return results
}

export async function readFile(filePath: string, workspacePath: string): Promise<Buffer> {
  assertWithinWorkspace(filePath, workspacePath)
  return fs.readFile(filePath)
}

export async function writeFile(
  dirPath: string, fileName: string, data: Buffer, workspacePath: string,
): Promise<void> {
  assertWithinWorkspace(dirPath, workspacePath)
  await fs.mkdir(dirPath, { recursive: true, mode: 0o755 })
  const fullPath = path.join(dirPath, fileName)
  assertWithinWorkspace(fullPath, workspacePath)
  await fs.writeFile(fullPath, data, { mode: 0o644 })
}

export async function removeFile(filePath: string, workspacePath: string): Promise<void> {
  assertWithinWorkspace(filePath, workspacePath)
  await fs.rm(filePath, { force: true })
}

export async function ensureDir(dirPath: string, workspacePath: string): Promise<void> {
  assertWithinWorkspace(dirPath, workspacePath)
  await fs.mkdir(dirPath, { recursive: true, mode: 0o755 })
}

export async function moveFile(
  sourcePath: string, targetPath: string, workspacePath: string,
): Promise<void> {
  assertWithinWorkspace(sourcePath, workspacePath)
  assertWithinWorkspace(targetPath, workspacePath)
  const targetDir = path.dirname(targetPath)
  await fs.mkdir(targetDir, { recursive: true, mode: 0o755 })
  await fs.rename(sourcePath, targetPath)
}

export async function statMtime(dirPath: string, workspacePath: string): Promise<string> {
  assertWithinWorkspace(dirPath, workspacePath)
  const stat = await fs.stat(dirPath)
  return Math.floor(stat.mtimeMs / 1000).toString()
}

/**
 * Create a tar.gz archive of a directory using the system `tar` command.
 * Returns a ReadableStream suitable for HTTP response streaming.
 */
export function downloadDirAsArchive(dirPath: string, workspacePath: string): ReadableStream<Uint8Array> {
  assertWithinWorkspace(dirPath, workspacePath)
  const child = spawn('tar', ['czf', '-', '-C', dirPath, '.'], {
    stdio: ['ignore', 'pipe', 'ignore'],
  })

  return new ReadableStream<Uint8Array>({
    start(controller) {
      child.stdout.on('data', (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk))
      })
      child.stdout.on('end', () => {
        controller.close()
      })
      child.stdout.on('error', (err) => {
        controller.error(err)
      })
      child.on('error', (err) => {
        controller.error(err)
      })
    },
    cancel() {
      child.kill()
    },
  })
}

/**
 * Create a symlink, removing existing one first.
 */
export async function createSymlink(
  target: string, linkPath: string, workspacePath: string,
): Promise<void> {
  assertWithinWorkspace(linkPath, workspacePath)
  await fs.rm(linkPath, { force: true })
  await fs.symlink(target, linkPath)
}
