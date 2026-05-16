import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'

import { getSkillDir, isSkillPathSafe } from '@/lib/skills/fs'

export const MAX_SKILL_IMPORT_FILES = 200
export const MAX_SKILL_IMPORT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_SKILL_IMPORT_TOTAL_BYTES = 20 * 1024 * 1024

const IGNORED_FILENAMES = new Set(['.DS_Store'])
const IGNORED_TOP_LEVEL_DIRS = new Set(['__MACOSX'])

export interface ImportedSkillFileInput {
  path: string
  contentBase64: string
  size?: number
}

export interface NormalizedImportedSkillFile {
  path: string
  content: Buffer
  size: number
}

export interface SkillImportMetadata {
  name: string
  description?: string
  emoji?: string
  tags?: string[]
}

function pathParts(filePath: string): string[] {
  if (
    filePath.startsWith('/') ||
    filePath.includes('\0') ||
    filePath.trim() === ''
  ) {
    throw new Error(`Unsafe import path: ${filePath}`)
  }

  const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean)
  if (
    parts.length === 0 ||
    parts.some((part) => part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe import path: ${filePath}`)
  }

  return parts
}

function stripSelectedFolderRoot(paths: string[]): string[] {
  if (paths.includes('SKILL.md')) return paths

  const splitPaths = paths.map(pathParts)
  const root = splitPaths[0]?.[0]
  const canStripRoot =
    !!root &&
    splitPaths.every((parts) => parts[0] === root && parts.length > 1)

  if (!canStripRoot) return paths
  return splitPaths.map((parts) => parts.slice(1).join('/'))
}

function shouldIgnorePath(filePath: string): boolean {
  const parts = pathParts(filePath)
  return (
    IGNORED_FILENAMES.has(parts[parts.length - 1]) ||
    IGNORED_TOP_LEVEL_DIRS.has(parts[0])
  )
}

function decodeImportContent(file: ImportedSkillFileInput): Buffer {
  const content = Buffer.from(file.contentBase64, 'base64')
  const declaredSize = file.size ?? content.length

  if (declaredSize !== content.length) {
    throw new Error(`Imported file size mismatch: ${file.path}`)
  }
  if (content.length > MAX_SKILL_IMPORT_FILE_BYTES) {
    throw new Error(`Imported file is too large: ${file.path}`)
  }

  return content
}

export function normalizeImportedSkillFiles(
  files: ImportedSkillFileInput[],
): NormalizedImportedSkillFile[] {
  if (files.length === 0) {
    throw new Error('Imported folder is empty')
  }
  if (files.length > MAX_SKILL_IMPORT_FILES) {
    throw new Error(`Imported folder has too many files; maximum is ${MAX_SKILL_IMPORT_FILES}`)
  }

  const candidateFiles = files.filter((file) => !shouldIgnorePath(file.path))
  const strippedPaths = stripSelectedFolderRoot(candidateFiles.map((file) => file.path))
  let totalBytes = 0

  const normalized = candidateFiles.map((file, index) => {
    const normalizedPath = strippedPaths[index]
    pathParts(normalizedPath)

    const content = decodeImportContent(file)
    totalBytes += content.length
    if (totalBytes > MAX_SKILL_IMPORT_TOTAL_BYTES) {
      throw new Error(
        `Imported folder is too large; maximum is ${MAX_SKILL_IMPORT_TOTAL_BYTES} bytes`,
      )
    }

    return {
      path: normalizedPath,
      content,
      size: content.length,
    }
  })

  const paths = new Set<string>()
  for (const file of normalized) {
    if (paths.has(file.path)) {
      throw new Error(`Duplicate import path: ${file.path}`)
    }
    paths.add(file.path)
  }

  if (!paths.has('SKILL.md')) {
    throw new Error('Imported folder must contain SKILL.md at its root')
  }

  return normalized.sort((a, b) => {
    if (a.path === 'SKILL.md') return -1
    if (b.path === 'SKILL.md') return 1
    return a.path.localeCompare(b.path)
  })
}

function parseSkillFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  const values: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim()
    let value = line.slice(colonIdx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (key) values[key] = value
  }

  return values
}

function titleFromSlug(slug: string): string {
  const words = slug.split(/[-_]+/).filter(Boolean)
  if (words.length === 0) return 'Imported Skill'
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ')
}

function parseTags(value: string | undefined): string[] | undefined {
  if (!value) return undefined

  const trimmed = value.trim()
  const listSource =
    trimmed.startsWith('[') && trimmed.endsWith(']')
      ? trimmed.slice(1, -1)
      : trimmed

  const tags = listSource
    .split(',')
    .map((tag) => tag.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .slice(0, 10)

  return tags.length > 0 ? tags : undefined
}

export function deriveSkillImportMetadata(
  skillMdContent: string,
  fallbackSlug: string,
): SkillImportMetadata {
  const frontmatter = parseSkillFrontmatter(skillMdContent)
  const metadata: SkillImportMetadata = {
    name: frontmatter.name || titleFromSlug(fallbackSlug),
  }

  if (frontmatter.description) metadata.description = frontmatter.description
  if (frontmatter.emoji) metadata.emoji = frontmatter.emoji

  const tags = parseTags(frontmatter.tags)
  if (tags) metadata.tags = tags

  return metadata
}

export function readImportedSkillText(file: NormalizedImportedSkillFile): string {
  return file.content.toString('utf-8')
}

export async function writeImportedSkillFiles(
  slug: string,
  files: NormalizedImportedSkillFile[],
): Promise<void> {
  const skillDir = getSkillDir(slug)

  for (const file of files) {
    if (!isSkillPathSafe(slug, file.path)) {
      throw new Error(`Unsafe import path: ${file.path}`)
    }

    const targetPath = join(skillDir, file.path)
    await mkdir(dirname(targetPath), { recursive: true })
    await writeFile(targetPath, file.content)
  }
}
