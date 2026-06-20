import { readdir, readFile, writeFile, mkdir, rm, stat, rename, access } from 'fs/promises'
import { join, relative, resolve } from 'path'
import { prisma } from '@/lib/db'
import type { SkillFileEntry } from '@/types/skill'

/** Base directory for skill file storage */
export function getSkillsBaseDir(): string {
  return (
    process.env.TEAMCLAW_SKILLS_DIR ||
    join(/* turbopackIgnore: true */ process.cwd(), 'data', 'skills')
  )
}

/** Get the directory path for a specific skill (local filesystem) */
export function getSkillDir(slug: string): string {
  return join(/* turbopackIgnore: true */ getSkillsBaseDir(), slug)
}

/**
 * For INSTANCE skills, locate the actual skill directory in one of the
 * connected instance workspaces. Returns null if not found.
 */
export async function findInstanceSkillDir(slug: string): Promise<string | null> {
  try {
    const instances = await prisma.instance.findMany({
      where: { workspacePath: { not: null } },
      select: { workspacePath: true },
    })
    const candidates = [
      ...instances.map((i) => join(/* turbopackIgnore: true */ i.workspacePath!, 'skills', slug)),
      ...instances.map((i) =>
        join(/* turbopackIgnore: true */ i.workspacePath!, 'workspace', 'skills', slug),
      ),
    ]
    for (const dir of candidates) {
      try {
        await access(/* turbopackIgnore: true */ join(/* turbopackIgnore: true */ dir, 'SKILL.md'))
        return dir
      } catch {
        continue
      }
    }
  } catch {
    // Prisma unavailable or no instances
  }
  return null
}

/** Resolve the actual on-disk directory for a skill based on its source. */
export async function resolveSkillDir(slug: string): Promise<string> {
  const instDir = await findInstanceSkillDir(slug)
  return instDir ?? getSkillDir(slug)
}

/** Validate path safety: no traversal, no absolute paths */
export function isSkillPathSafe(_slug: string, filePath: string): boolean {
  if (filePath.includes('..') || filePath.startsWith('/')) return false
  return true
}

/** Ensure a skill directory exists */
export async function ensureSkillDir(slug: string): Promise<string> {
  const dir = getSkillDir(slug)
  await mkdir(/* turbopackIgnore: true */ dir, { recursive: true })
  return dir
}

/** Create default SKILL.md content */
export function generateDefaultSkillMd(name: string, description?: string, emoji?: string): string {
  const lines = ['---', `name: "${name}"`]
  if (emoji) lines.push(`emoji: "${emoji}"`)
  if (description) lines.push(`description: "${description.replace(/"/g, '\\"')}"`)
  lines.push('---', '', `# ${name}`, '')
  if (description) lines.push(description, '')
  return lines.join('\n')
}

/** List files in a skill directory (recursive, relative paths) */
export async function listSkillFiles(slug: string, subdir?: string): Promise<SkillFileEntry[]> {
  const baseDir = getSkillDir(slug)
  const targetDir = subdir ? join(/* turbopackIgnore: true */ baseDir, subdir) : baseDir

  try {
    const entries = await readdir(/* turbopackIgnore: true */ targetDir, { withFileTypes: true })
    const files: SkillFileEntry[] = []

    for (const entry of entries) {
      const fullPath = join(/* turbopackIgnore: true */ targetDir, entry.name)
      const relPath = relative(baseDir, fullPath)

      if (entry.isDirectory()) {
        files.push({ name: entry.name, path: relPath, type: 'directory' })
      } else {
        const st = await stat(/* turbopackIgnore: true */ fullPath).catch(() => null)
        files.push({
          name: entry.name,
          path: relPath,
          type: 'file',
          size: st?.size,
        })
      }
    }

    return files.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  } catch {
    return []
  }
}

/** Throw if path escapes the skill directory (defense-in-depth). */
function assertSafePath(slug: string, filePath: string): void {
  if (!isSkillPathSafe(slug, filePath)) {
    throw new Error(`Unsafe file path: ${filePath}`)
  }
}

/** Read a file from a skill directory */
export async function readSkillFile(slug: string, filePath: string): Promise<string> {
  assertSafePath(slug, filePath)
  const dir = await resolveSkillDir(slug)
  const fullPath = join(/* turbopackIgnore: true */ dir, filePath)
  return readFile(/* turbopackIgnore: true */ fullPath, 'utf-8')
}

/** Write a file to a skill directory */
export async function writeSkillFile(
  slug: string,
  filePath: string,
  content: string,
): Promise<void> {
  assertSafePath(slug, filePath)
  const dir = await resolveSkillDir(slug)
  const fullPath = join(/* turbopackIgnore: true */ dir, filePath)
  const parent = join(/* turbopackIgnore: true */ fullPath, '..')
  await mkdir(/* turbopackIgnore: true */ parent, { recursive: true })
  await writeFile(/* turbopackIgnore: true */ fullPath, content, 'utf-8')
}

/** Delete a file from a skill directory */
export async function deleteSkillFile(slug: string, filePath: string): Promise<void> {
  assertSafePath(slug, filePath)
  const dir = await resolveSkillDir(slug)
  const fullPath = join(/* turbopackIgnore: true */ dir, filePath)
  await rm(/* turbopackIgnore: true */ fullPath, { recursive: true })
}

/** Delete entire skill directory */
export async function deleteSkillDir(slug: string): Promise<void> {
  const dir = getSkillDir(slug)
  await rm(/* turbopackIgnore: true */ dir, { recursive: true, force: true })
}

/** Rename a skill directory (when slug changes) */
export async function renameSkillDir(oldSlug: string, newSlug: string): Promise<void> {
  const oldDir = getSkillDir(oldSlug)
  const newDir = getSkillDir(newSlug)
  await rename(/* turbopackIgnore: true */ oldDir, /* turbopackIgnore: true */ newDir)
}

/** Parse YAML frontmatter from SKILL.md content */
export function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return null

  const yaml = match[1]
  const result: Record<string, unknown> = {}

  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    let value: string | boolean | number = line.slice(colonIdx + 1).trim()
    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (value === 'true') value = true
    else if (value === 'false') value = false
    else if (/^\d+$/.test(value as string)) value = parseInt(value as string)
    if (key) result[key] = value
  }

  return result
}
