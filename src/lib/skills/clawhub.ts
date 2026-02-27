import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { ClawHubSearchResult } from '@/types/skill'

const execFileAsync = promisify(execFile)

const CLAWHUB_REGISTRY_URL = process.env.CLAWHUB_REGISTRY_URL || 'https://clawhub.ai'

/* ─── Retry-aware fetch ─────────────────────────────────── */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Fetch with automatic retry on timeout, 429, and 5xx errors.
 * - 429: respects Retry-After header (capped at 10s to avoid extreme waits)
 * - Timeout/5xx: exponential backoff (2s, 4s)
 */
async function fetchWithRetry(
  url: string,
  opts: { timeoutMs?: number; maxRetries?: number } = {},
): Promise<Response> {
  const { timeoutMs = 30_000, maxRetries = 2 } = opts

  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
      })

      // 429 Too Many Requests — wait and retry
      if (res.status === 429 && attempt < maxRetries) {
        const retryAfter = parseInt(res.headers.get('retry-after') || '', 10)
        // Cap wait to 10s — don't block the request for minutes
        const waitMs = Math.min((retryAfter > 0 ? retryAfter : 3) * 1000, 10_000)
        console.warn(`[clawhub] 429 rate-limited, retrying after ${waitMs}ms (attempt ${attempt + 1})`)
        await sleep(waitMs)
        continue
      }

      // 5xx server error — retry with backoff
      if (res.status >= 500 && attempt < maxRetries) {
        const waitMs = 2000 * Math.pow(2, attempt)
        console.warn(`[clawhub] ${res.status} server error, retrying after ${waitMs}ms (attempt ${attempt + 1})`)
        await sleep(waitMs)
        continue
      }

      return res
    } catch (err) {
      lastError = err as Error
      if (attempt < maxRetries) {
        const waitMs = 2000 * Math.pow(2, attempt)
        console.warn(`[clawhub] fetch error: ${(err as Error).message}, retrying after ${waitMs}ms (attempt ${attempt + 1})`)
        await sleep(waitMs)
        continue
      }
    }
  }

  throw lastError || new Error('fetchWithRetry exhausted all retries')
}

/* ─── In-memory cache for skill info (avoids redundant API calls) ── */

const infoCache = new Map<string, { data: ClawHubSkillInfo; ts: number }>()
const INFO_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

function getCachedInfo(slug: string): ClawHubSkillInfo | null {
  const entry = infoCache.get(slug)
  if (entry && Date.now() - entry.ts < INFO_CACHE_TTL) return entry.data
  if (entry) infoCache.delete(slug)
  return null
}

function setCachedInfo(slug: string, data: ClawHubSkillInfo): void {
  infoCache.set(slug, { data, ts: Date.now() })
}

/* ─── Slug parsing ──────────────────────────────────────── */

/**
 * Parse a ClawHub URL into a plain slug (last segment only, for filesystem).
 * "https://clawhub.ai/Borye/xiaohongshu-mcp" → "xiaohongshu-mcp"
 * "Borye/xiaohongshu-mcp" → "xiaohongshu-mcp"
 */
export function parseClawHubSlug(input: string): string {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (url.hostname.includes('clawhub')) {
      const segments = url.pathname.replace(/^\/+|\/+$/g, '').split('/')
      return segments[segments.length - 1] || trimmed
    }
  } catch {
    // Not a URL
  }
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    return parts[parts.length - 1] || trimmed
  }
  return trimmed
}

/**
 * Extract full ClawHub path (owner/slug) for link construction.
 * "https://clawhub.ai/Borye/xiaohongshu-mcp" → "Borye/xiaohongshu-mcp"
 * "Borye/xiaohongshu-mcp" → "Borye/xiaohongshu-mcp"
 * "xiaohongshu-mcp" → null (no owner info)
 */
export function parseClawHubFullPath(input: string): string | null {
  const trimmed = input.trim()
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`)
    if (url.hostname.includes('clawhub')) {
      const path = url.pathname.replace(/^\/+|\/+$/g, '')
      if (path.includes('/')) return path
    }
  } catch {
    // Not a URL
  }
  if (trimmed.includes('/') && !trimmed.includes('://')) {
    return trimmed
  }
  return null
}

/* ─── CLI output parsing ────────────────────────────────── */

/**
 * Parse text output from `clawhub search`.
 * Handles two formats:
 *   - With version: "slug vX.Y.Z  description  (score)"
 *   - Without version: "slug  description  (score)"
 */
function parseSearchOutput(stdout: string): ClawHubSearchResult[] {
  const results: ClawHubSearchResult[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('✔') || trimmed.startsWith('[')) continue

    const matchWithVer = trimmed.match(/^(\S+)\s+v(\d+\.\d+\.\d+)\s{2,}(.+?)\s{2,}\([\d.]+\)$/)
    if (matchWithVer) {
      results.push({
        slug: matchWithVer[1],
        name: matchWithVer[1],
        version: matchWithVer[2],
        description: matchWithVer[3].trim(),
        author: '',
        tags: [],
        homepage: '',
      })
      continue
    }

    const matchNoVer = trimmed.match(/^(\S+)\s{2,}(.+?)\s{2,}\([\d.]+\)$/)
    if (matchNoVer) {
      results.push({
        slug: matchNoVer[1],
        name: matchNoVer[2].trim(),
        version: '',
        description: matchNoVer[2].trim(),
        author: '',
        tags: [],
        homepage: '',
      })
    }
  }
  return results
}

/* ─── Search ────────────────────────────────────────────── */

/**
 * Search ClawHub for skills.
 * Tries HTTP API first (works in all environments), falls back to CLI.
 */
export async function searchClawHub(query: string): Promise<ClawHubSearchResult[]> {
  const slug = parseClawHubSlug(query)

  // Primary: HTTP API
  try {
    const res = await fetchWithRetry(
      `${CLAWHUB_REGISTRY_URL}/api/v1/search?q=${encodeURIComponent(slug)}`,
    )
    if (res.ok) {
      const data = await res.json() as {
        results?: Array<{
          slug: string
          displayName: string
          summary: string
          score: number
          version: string | null
        }>
      }
      if (data.results && data.results.length > 0) {
        return data.results.map((r) => ({
          slug: r.slug,
          name: r.displayName || r.slug,
          version: r.version || '',
          description: r.summary || '',
          author: '',
          tags: [],
          homepage: `${CLAWHUB_REGISTRY_URL}/${r.slug}`,
        }))
      }
    }
  } catch (err) {
    console.error('[clawhub:search] HTTP API failed:', (err as Error).message)
  }

  // Fallback: CLI
  try {
    const { stdout } = await execFileAsync('clawhub', ['search', slug, '--no-input'], {
      timeout: 30_000,
      env: { ...process.env, CLAWHUB_REGISTRY: CLAWHUB_REGISTRY_URL },
    })
    return parseSearchOutput(stdout)
  } catch (err) {
    console.error('[clawhub:search] CLI failed:', (err as Error).message)
    return []
  }
}

/* ─── Pull / Install ────────────────────────────────────── */

/**
 * Install a skill from ClawHub to a local directory.
 * Tries CLI first, falls back to HTTP API for Docker environments.
 */
export async function pullClawHubSkill(
  slug: string,
  targetDir: string,
): Promise<{ name: string; version: string; description?: string } | null> {
  const parentDir = dirname(targetDir)

  // Try CLI first — it handles rate limiting and batched downloads internally
  try {
    await execFileAsync('clawhub', ['install', slug, '--dir', parentDir, '--force', '--no-input'], {
      timeout: 60_000,
      env: { ...process.env, CLAWHUB_REGISTRY: CLAWHUB_REGISTRY_URL },
    })

    try {
      const metaPath = join(parentDir, slug, '_meta.json')
      const metaRaw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(metaRaw) as { slug: string; version: string }
      return {
        name: meta.slug || slug,
        version: meta.version || '1.0.0',
      }
    } catch {
      return { name: slug, version: '1.0.0' }
    }
  } catch (cliErr) {
    console.error('[clawhub:install] CLI failed, trying HTTP fallback:', (cliErr as Error).message)
  }

  // Brief pause before HTTP fallback — CLI failure may have been due to rate limiting
  await sleep(2000)

  // Fallback: download files via HTTP API
  try {
    return await pullViaHttpApi(slug, targetDir)
  } catch (err) {
    console.error('[clawhub:install] HTTP fallback failed:', (err as Error).message)
    return null
  }
}

/**
 * Pull a skill by downloading individual files from the ClawHub HTTP API.
 * Uses throttled sequential downloads to avoid triggering rate limits.
 */
async function pullViaHttpApi(
  slug: string,
  targetDir: string,
): Promise<{ name: string; version: string; description?: string } | null> {
  // Get skill info (uses cache to avoid redundant calls)
  const info = await getClawHubInfo(slug)
  if (!info) {
    throw new Error(`Skill "${slug}" not found on ClawHub`)
  }

  // Small delay before next API call to avoid rate limiting
  await sleep(500)

  // Get version details with file list
  const versionRes = await fetchWithRetry(
    `${CLAWHUB_REGISTRY_URL}/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(info.version)}`,
  )
  if (!versionRes.ok) {
    throw new Error(`Failed to get version info: ${versionRes.status}`)
  }

  const versionData = await versionRes.json() as {
    version?: {
      version: string
      files?: Array<{ path: string; sha256: string; contentType: string; size: number }>
    }
  }

  const files = versionData.version?.files
  if (!files || files.length === 0) {
    throw new Error('No files found in skill version')
  }

  // Ensure target directory exists
  await mkdir(targetDir, { recursive: true })

  // Download files sequentially with throttling to avoid rate limits
  for (let i = 0; i < files.length; i++) {
    const file = files[i]

    // Throttle: 800ms delay between file downloads (except the first one)
    if (i > 0) await sleep(800)

    const fileUrl = `${CLAWHUB_REGISTRY_URL}/api/v1/skills/${encodeURIComponent(slug)}/versions/${encodeURIComponent(info.version)}/blob/${file.sha256}`
    let downloaded = false

    try {
      const fileRes = await fetchWithRetry(fileUrl)
      if (fileRes.ok) {
        const content = await fileRes.text()
        const filePath = join(targetDir, file.path)
        await mkdir(dirname(filePath), { recursive: true })
        await writeFile(filePath, content, 'utf-8')
        downloaded = true
      }
    } catch {
      // Primary URL failed, will try alternative below
    }

    if (!downloaded) {
      await sleep(500)
      try {
        const altUrl = `${CLAWHUB_REGISTRY_URL}/api/v1/blobs/${file.sha256}`
        const altRes = await fetchWithRetry(altUrl)
        if (altRes.ok) {
          const content = await altRes.text()
          const filePath = join(targetDir, file.path)
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(filePath, content, 'utf-8')
          downloaded = true
        }
      } catch {
        // Both URLs failed
      }
    }

    if (!downloaded) {
      console.error(`[clawhub:pull] Failed to download ${file.path}, skipping`)
    }
  }

  // Write _meta.json for compatibility with CLI-installed skills
  const meta = { slug, version: info.version, source: 'clawhub-http' }
  await writeFile(join(targetDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

  return {
    name: info.name,
    version: info.version,
    description: info.description,
  }
}

/* ─── Skill info ────────────────────────────────────────── */

/** Parsed response from ClawHub's single-skill API */
export interface ClawHubSkillInfo {
  slug: string
  name: string
  version: string
  description: string
  ownerHandle: string
  homepage: string
}

/**
 * Get info about a ClawHub skill via HTTP API.
 * Results are cached for 5 minutes to reduce API calls.
 */
export async function getClawHubInfo(
  slug: string,
): Promise<ClawHubSkillInfo | null> {
  // Check cache first
  const cached = getCachedInfo(slug)
  if (cached) return cached

  try {
    const res = await fetchWithRetry(
      `${CLAWHUB_REGISTRY_URL}/api/v1/skills/${encodeURIComponent(slug)}`,
    )
    if (!res.ok) return null
    const data = await res.json() as {
      skill?: { slug?: string; displayName?: string; summary?: string }
      latestVersion?: { version?: string }
      owner?: { handle?: string }
    }
    const skillSlug = data.skill?.slug || slug
    const ownerHandle = data.owner?.handle || ''
    const info: ClawHubSkillInfo = {
      slug: skillSlug,
      name: data.skill?.displayName || skillSlug,
      version: data.latestVersion?.version || '0.0.0',
      description: data.skill?.summary || '',
      ownerHandle,
      homepage: ownerHandle
        ? `${CLAWHUB_REGISTRY_URL}/${ownerHandle}/${skillSlug}`
        : `${CLAWHUB_REGISTRY_URL}/${skillSlug}`,
    }
    setCachedInfo(slug, info)
    return info
  } catch {
    return null
  }
}
