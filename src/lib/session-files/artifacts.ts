import * as fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  buildExternalSessionBasePath,
  buildCurrentSessionLinkPath,
  buildExternalWorkspaceSessionLinkPath,
  buildSessionOutputPath,
  resolveExternalSessionFilePath,
} from './helpers'

export interface SessionArtifact {
  fileName: string
  relativePath: string
}

export interface NormalizeExternalSessionArtifactsOptions {
  workspacePath: string
  agentId: string
  chatSessionId: string
  runStartedAt: Date
  outputSnapshot?: SessionOutputSnapshot | null
}

export interface NormalizeContainerSessionArtifactsOptions {
  containerId: string
  agentId: string
  chatSessionId: string
  runStartedAt: Date
  execWithOutput: (containerId: string, cmd: string[]) => Promise<string>
  outputSnapshot?: SessionOutputSnapshot | null
}

export interface CreateContainerSessionOutputSnapshotOptions {
  containerId: string
  agentId: string
  chatSessionId: string
  execWithOutput: (containerId: string, cmd: string[]) => Promise<string>
}

export interface CreateExternalSessionOutputSnapshotOptions {
  workspacePath: string
  agentId: string
  chatSessionId: string
}

export interface SessionOutputSnapshot {
  backupDir: string
}

const ARTIFACT_EXTENSIONS = new Set([
  '.html',
  '.htm',
  '.md',
  '.pdf',
  '.csv',
  '.json',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.pptx',
  '.xlsx',
  '.docx',
])

const RESERVED_ROOT_FILES = new Set([
  'AGENTS.md',
  'SOUL.md',
  'TOOLS.md',
  'IDENTITY.md',
  'USER.md',
  'HEARTBEAT.md',
  'BOOTSTRAP.md',
  'MEMORY.md',
])

const RUN_CLOCK_SKEW_MS = 2_000

function isArtifactFileName(fileName: string): boolean {
  if (fileName.startsWith('.')) return false
  return ARTIFACT_EXTENSIONS.has(path.extname(fileName).toLowerCase())
}

function isRecent(stat: { mtimeMs: number }, runStartedAt: Date): boolean {
  return stat.mtimeMs >= runStartedAt.getTime() - RUN_CLOCK_SKEW_MS
}

function externalWorkspaceDir(workspacePath: string, agentId: string): string {
  return path.dirname(buildExternalWorkspaceSessionLinkPath(workspacePath, agentId))
}

function containerWorkspaceDir(agentId: string): string {
  return path.posix.dirname(buildCurrentSessionLinkPath(agentId))
}

function assertInside(baseDir: string, filePath: string): void {
  const base = path.resolve(baseDir)
  const resolved = path.resolve(filePath)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) {
    throw new Error('Path traversal detected')
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath)
    return true
  } catch {
    return false
  }
}

async function safeRelativeFilePath(baseDir: string, filePath: string): Promise<string | null> {
  assertInside(baseDir, filePath)
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat?.isFile()) return null
  const relativePath = path.relative(baseDir, filePath)
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return null
  if (relativePath.split(path.sep).some((segment) => segment.startsWith('.'))) return null
  if (!isArtifactFileName(path.basename(relativePath))) return null
  return relativePath.split(path.sep).join('/')
}

async function listRecentFilesRecursive(
  baseDir: string,
  runStartedAt: Date,
): Promise<{ absolutePath: string; relativePath: string }[]> {
  const results: { absolutePath: string; relativePath: string }[] = []

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }
      if (!entry.isFile() || !isArtifactFileName(entry.name)) continue
      const stat = await fs.stat(absolutePath).catch(() => null)
      if (!stat || !isRecent(stat, runStartedAt)) continue
      const relativePath = await safeRelativeFilePath(baseDir, absolutePath)
      if (relativePath) results.push({ absolutePath, relativePath })
    }
  }

  await walk(baseDir)
  return results
}

async function listArtifactFilesRecursive(
  baseDir: string,
): Promise<{ absolutePath: string; relativePath: string }[]> {
  return listRecentFilesRecursive(baseDir, new Date(0))
}

async function listRecentWorkspaceRootFiles(
  workspaceDir: string,
  runStartedAt: Date,
): Promise<{ absolutePath: string; relativePath: string }[]> {
  let entries: Dirent[]
  try {
    entries = await fs.readdir(workspaceDir, { withFileTypes: true })
  } catch {
    return []
  }

  const results: { absolutePath: string; relativePath: string }[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (RESERVED_ROOT_FILES.has(entry.name)) continue
    if (!isArtifactFileName(entry.name)) continue
    const absolutePath = path.join(workspaceDir, entry.name)
    const stat = await fs.stat(absolutePath).catch(() => null)
    if (!stat || !isRecent(stat, runStartedAt)) continue
    results.push({ absolutePath, relativePath: entry.name })
  }
  return results
}

function splitExtension(fileName: string): { base: string; ext: string } {
  const ext = path.extname(fileName)
  return { base: fileName.slice(0, fileName.length - ext.length), ext }
}

async function uniqueOutputRelativePath(outputDir: string, desiredRelativePath: string): Promise<string> {
  const normalized = desiredRelativePath.split('/').filter(Boolean)
  const dir = normalized.slice(0, -1).join('/')
  const fileName = normalized.at(-1)
  if (!fileName) throw new Error('Invalid artifact path')

  const { base, ext } = splitExtension(fileName)
  let candidate = dir ? `${dir}/${fileName}` : fileName
  let index = 2

  while (await pathExists(path.join(outputDir, candidate))) {
    const nextName = `${base}-${index}${ext}`
    candidate = dir ? `${dir}/${nextName}` : nextName
    index++
  }

  return candidate
}

async function copyIntoOutput(
  sourcePath: string,
  outputDir: string,
  desiredRelativePath: string,
): Promise<string> {
  assertInside(outputDir, path.join(outputDir, desiredRelativePath))
  const targetRelativePath = await uniqueOutputRelativePath(outputDir, desiredRelativePath)
  const targetPath = path.join(outputDir, targetRelativePath)
  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o755 })
  await fs.copyFile(sourcePath, targetPath)
  return targetRelativePath.split(path.sep).join('/')
}

function backupFilePath(snapshot: SessionOutputSnapshot, relativePath: string): string {
  return path.join(snapshot.backupDir, relativePath)
}

async function restoreExternalSnapshotFile(
  snapshot: SessionOutputSnapshot,
  outputDir: string,
  relativePath: string,
): Promise<void> {
  const sourcePath = backupFilePath(snapshot, relativePath)
  const targetPath = path.join(outputDir, relativePath)
  assertInside(outputDir, targetPath)
  const sourceStat = await fs.stat(sourcePath)
  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o755 })
  await fs.copyFile(sourcePath, targetPath)
  await fs.utimes(targetPath, sourceStat.atime, sourceStat.mtime)
}

export async function createExternalSessionOutputSnapshot(
  opts: CreateExternalSessionOutputSnapshotOptions,
): Promise<SessionOutputSnapshot> {
  const outputDir = resolveExternalSessionFilePath(
    opts.workspacePath,
    opts.agentId,
    opts.chatSessionId,
    'output',
  )
  const backupDir = path.join(
    buildExternalSessionBasePath(opts.workspacePath, opts.agentId, opts.chatSessionId),
    'output-backup',
    `.teamclaw-${randomUUID()}`,
  )
  await fs.rm(backupDir, { recursive: true, force: true })
  await fs.mkdir(backupDir, { recursive: true, mode: 0o755 })

  for (const file of await listArtifactFilesRecursive(outputDir)) {
    const targetPath = path.join(backupDir, file.relativePath)
    const sourceStat = await fs.stat(file.absolutePath)
    await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o755 })
    await fs.copyFile(file.absolutePath, targetPath)
    await fs.utimes(targetPath, sourceStat.atime, sourceStat.mtime)
  }

  return { backupDir }
}

export async function normalizeExternalSessionArtifacts(
  opts: NormalizeExternalSessionArtifactsOptions,
): Promise<SessionArtifact[]> {
  const outputDir = resolveExternalSessionFilePath(
    opts.workspacePath,
    opts.agentId,
    opts.chatSessionId,
    'output',
  )
  const workspaceDir = externalWorkspaceDir(opts.workspacePath, opts.agentId)
  const legacyOutputDir = path.join(workspaceDir, 'output')
  await fs.mkdir(outputDir, { recursive: true, mode: 0o755 })

  const artifacts: SessionArtifact[] = []
  const seen = new Set<string>()

  const addArtifact = (relativePath: string) => {
    const normalized = relativePath.split(path.sep).join('/')
    if (seen.has(normalized)) return
    artifacts.push({ fileName: path.basename(normalized), relativePath: normalized })
    seen.add(normalized)
  }

  try {
    for (const file of await listRecentFilesRecursive(outputDir, opts.runStartedAt)) {
      const backupPath = opts.outputSnapshot
        ? backupFilePath(opts.outputSnapshot, file.relativePath)
        : null
      if (backupPath && await pathExists(backupPath)) {
        const copiedPath = await copyIntoOutput(file.absolutePath, outputDir, file.relativePath)
        await restoreExternalSnapshotFile(opts.outputSnapshot!, outputDir, file.relativePath)
        addArtifact(copiedPath)
      } else {
        addArtifact(file.relativePath)
      }
    }

    for (const file of await listRecentFilesRecursive(legacyOutputDir, opts.runStartedAt)) {
      const copiedPath = await copyIntoOutput(file.absolutePath, outputDir, file.relativePath)
      addArtifact(copiedPath)
    }

    for (const file of await listRecentWorkspaceRootFiles(workspaceDir, opts.runStartedAt)) {
      const copiedPath = await copyIntoOutput(file.absolutePath, outputDir, file.relativePath)
      addArtifact(copiedPath)
    }
  } finally {
    if (opts.outputSnapshot?.backupDir) {
      await fs.rm(path.dirname(opts.outputSnapshot.backupDir), { recursive: true, force: true })
        .catch(() => {})
    }
  }

  return artifacts
}

const CONTAINER_SNAPSHOT_SCRIPT = String.raw`
set -eu
output_dir="$1"
backup_dir="$2"

rm -rf -- "$backup_dir"
mkdir -p -- "$backup_dir"

is_artifact_name() {
  name="$1"
  case "$name" in
    .*|AGENTS.md|SOUL.md|TOOLS.md|IDENTITY.md|USER.md|HEARTBEAT.md|BOOTSTRAP.md|MEMORY.md)
      return 1
      ;;
  esac
  lower=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
  case "$lower" in
    *.html|*.htm|*.md|*.pdf|*.csv|*.json|*.txt|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.svg|*.pptx|*.xlsx|*.docx)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

[ -d "$output_dir" ] || exit 0
find "$output_dir" -type f 2>/dev/null | while IFS= read -r src; do
  name=$(basename "$src")
  is_artifact_name "$name" || continue
  rel=$(printf '%s' "$src" | awk -v prefix="$output_dir/" 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1) }')
  case "$rel" in
    .*|*/.*|../*|/*) continue ;;
  esac
  mkdir -p -- "$(dirname "$backup_dir/$rel")"
  cp -p -- "$src" "$backup_dir/$rel"
done
`

const CONTAINER_NORMALIZE_SCRIPT = String.raw`
set -eu
workspace_dir="$1"
output_dir="$2"
legacy_output_dir="$3"
threshold="$4"
backup_dir="$5"

mkdir -p -- "$output_dir"

is_artifact_name() {
  name="$1"
  case "$name" in
    .*|AGENTS.md|SOUL.md|TOOLS.md|IDENTITY.md|USER.md|HEARTBEAT.md|BOOTSTRAP.md|MEMORY.md)
      return 1
      ;;
  esac
  lower=$(printf '%s' "$name" | tr '[:upper:]' '[:lower:]')
  case "$lower" in
    *.html|*.htm|*.md|*.pdf|*.csv|*.json|*.txt|*.png|*.jpg|*.jpeg|*.gif|*.webp|*.svg|*.pptx|*.xlsx|*.docx)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

file_mtime() {
  stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null || printf '0'
}

copy_unique() {
  src="$1"
  rel="$2"
  dir=$(dirname "$rel")
  file=$(basename "$rel")
  ext=""
  base="$file"
  case "$file" in
    *.*)
      ext=".$(printf '%s' "$file" | awk -F. '{ print $NF }')"
      base=$(printf '%s' "$file" | sed 's/\.[^.]*$//')
      ;;
  esac
  target_rel="$rel"
  i=2
  while [ -e "$output_dir/$target_rel" ]; do
    if [ "$dir" = "." ]; then
      target_rel="$base-$i$ext"
    else
      target_rel="$dir/$base-$i$ext"
    fi
    i=$((i + 1))
  done
  mkdir -p -- "$(dirname "$output_dir/$target_rel")"
  cp -- "$src" "$output_dir/$target_rel"
  printf '%s\n' "$target_rel"
}

backup_file_exists() {
  rel="$1"
  [ -n "$backup_dir" ] && [ -f "$backup_dir/$rel" ]
}

restore_backup() {
  rel="$1"
  mkdir -p -- "$(dirname "$output_dir/$rel")"
  cp -p -- "$backup_dir/$rel" "$output_dir/$rel"
}

scan_recursive() {
  base_dir="$1"
  mode="$2"
  [ -d "$base_dir" ] || return 0
  find "$base_dir" -type f 2>/dev/null | while IFS= read -r src; do
    name=$(basename "$src")
    is_artifact_name "$name" || continue
    mtime=$(file_mtime "$src")
    [ "$mtime" -lt "$threshold" ] && continue
    rel=$(printf '%s' "$src" | awk -v prefix="$base_dir/" 'index($0, prefix) == 1 { print substr($0, length(prefix) + 1) }')
    case "$rel" in
      .*|*/.*|../*|/*) continue ;;
    esac
    if [ "$mode" = "canonical" ]; then
      if backup_file_exists "$rel"; then
        copy_unique "$src" "$rel"
        restore_backup "$rel"
      else
        printf '%s\n' "$rel"
      fi
    else
      copy_unique "$src" "$rel"
    fi
  done
}

scan_root() {
  [ -d "$workspace_dir" ] || return 0
  for src in "$workspace_dir"/*; do
    [ -f "$src" ] || continue
    name=$(basename "$src")
    is_artifact_name "$name" || continue
    mtime=$(file_mtime "$src")
    [ "$mtime" -lt "$threshold" ] && continue
    copy_unique "$src" "$name"
  done
}

scan_recursive "$output_dir" canonical
scan_recursive "$legacy_output_dir" copy
scan_root
`

export async function createContainerSessionOutputSnapshot(
  opts: CreateContainerSessionOutputSnapshotOptions,
): Promise<SessionOutputSnapshot> {
  const outputDir = buildSessionOutputPath(opts.agentId, opts.chatSessionId).replace(/\/$/, '')
  const backupDir = path.posix.join(
    path.posix.dirname(outputDir),
    `output-backup/.teamclaw-${randomUUID()}`,
  )
  await opts.execWithOutput(opts.containerId, [
    'sh',
    '-c',
    CONTAINER_SNAPSHOT_SCRIPT,
    '--',
    outputDir,
    backupDir,
  ])
  return { backupDir }
}

export async function normalizeContainerSessionArtifacts(
  opts: NormalizeContainerSessionArtifactsOptions,
): Promise<SessionArtifact[]> {
  const outputDir = buildSessionOutputPath(opts.agentId, opts.chatSessionId).replace(/\/$/, '')
  const workspaceDir = containerWorkspaceDir(opts.agentId)
  const legacyOutputDir = path.posix.join(workspaceDir, 'output')
  const thresholdSeconds = Math.floor((opts.runStartedAt.getTime() - RUN_CLOCK_SKEW_MS) / 1000)
  let output: string
  try {
    output = await opts.execWithOutput(opts.containerId, [
      'sh',
      '-c',
      CONTAINER_NORMALIZE_SCRIPT,
      '--',
      workspaceDir,
      outputDir,
      legacyOutputDir,
      String(thresholdSeconds),
      opts.outputSnapshot?.backupDir ?? '',
    ])
  } finally {
    if (opts.outputSnapshot?.backupDir) {
      await opts.execWithOutput(opts.containerId, [
        'rm',
        '-rf',
        '--',
        path.posix.dirname(opts.outputSnapshot.backupDir),
      ]).catch(() => {})
    }
  }

  const artifacts: SessionArtifact[] = []
  const seen = new Set<string>()
  for (const line of output.split('\n')) {
    const relativePath = line.trim()
    if (!relativePath || relativePath.startsWith('/') || relativePath.includes('..')) continue
    if (seen.has(relativePath)) continue
    artifacts.push({ fileName: path.posix.basename(relativePath), relativePath })
    seen.add(relativePath)
  }
  return artifacts
}

function encodeOutputHref(relativePath: string): string {
  return `output/${relativePath.split('/').map(encodeURIComponent).join('/')}`
}

function isSafeOutputHrefPath(encodedPath: string): boolean {
  let decoded: string
  try {
    decoded = decodeURIComponent(encodedPath)
  } catch {
    return false
  }

  if (!decoded || decoded.startsWith('/') || decoded.includes('\0')) return false
  if (decoded.includes('..') || decoded.includes('${') || decoded.includes('$')) return false
  if (decoded.includes('{') || decoded.includes('}')) return false
  if (decoded.includes('//')) return false
  if (decoded.split('/').some((segment) => !segment || segment.startsWith('.'))) return false
  return true
}

/**
 * Keep valid TeamClaw output links, but strip malformed links produced by
 * earlier shell-normalization bugs such as output/${src#/workspace/...}.
 */
export function sanitizeOutputArtifactLinks(content: string): string {
  return content
    .replace(
      /\[([^\]]*)\]\((?:\.\/)?output\/([^)]+)\)/g,
      (match, label: string, encodedPath: string) => {
        if (isSafeOutputHrefPath(encodedPath)) return match
        const trimmed = label.trim()
        return trimmed && trimmed !== '}' ? trimmed : ''
      },
    )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

export function stripOutputArtifactLinksToLabels(content: string): string {
  return sanitizeOutputArtifactLinks(content).replace(
    /\[([^\]]+)\]\((?:\.\/)?output\/[^)]+\)/g,
    '$1',
  )
}

export function artifactLinksMarkdown(artifacts: SessionArtifact[]): string {
  const lines = artifacts.map((artifact) => {
    const href = encodeOutputHref(artifact.relativePath)
    return `[${artifact.fileName}](${href})`
  })
  return lines.join('\n')
}

export function appendArtifactLinks(content: string, artifacts: SessionArtifact[]): string {
  const baseContent = stripOutputArtifactLinksToLabels(content)
  const missing = artifacts.filter((artifact) => {
    const href = encodeOutputHref(artifact.relativePath)
    return !baseContent.includes(`](${href})`)
  })
  if (missing.length === 0) return baseContent

  const links = artifactLinksMarkdown(missing)
  if (!baseContent.trim()) return links
  return `${baseContent.trimEnd()}\n\n${links}`
}
