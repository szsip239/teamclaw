import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile, mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { unzipSync } from 'fflate'
import type { ClawHubSearchResult } from '@/types/skill'

const execFileAsync = promisify(execFile)

/** Site URL — used for homepage links displayed to users */
const CLAWHUB_SITE_URL = process.env.CLAWHUB_REGISTRY_URL || 'https://clawhub.ai'

/**
 * API base URL — used for all ClawHub API calls (search, download, skill info).
 *
 * Defaults to the Convex backend directly instead of the clawhub.ai Vercel proxy.
 * The proxy adds its own rate limiting layer (20 download req/60s) ON TOP of the
 * Convex-level rate limit. Bypassing the proxy doubles the effective rate limit
 * and eliminates the Vercel 429 bottleneck.
 */
const CLAWHUB_API_BASE = process.env.CLAWHUB_API_BASE || 'https://wry-manatee-359.convex.site'

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
      `${CLAWHUB_API_BASE}/api/v1/search?q=${encodeURIComponent(slug)}`,
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
          homepage: `${CLAWHUB_SITE_URL}/${r.slug}`,
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
      env: { ...process.env, CLAWHUB_REGISTRY: CLAWHUB_API_BASE },
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
 *
 * Strategy: HTTP ZIP download first (1 API call), CLI as fallback.
 *
 * The ClawHub download endpoint has a tight rate limit (20 req/60s).
 * The CLI wastes this quota with internal retries (resolve + download,
 * each with p-retry), so we prefer the HTTP path which makes exactly
 * 1 download request — same as a browser would.
 */
export async function pullClawHubSkill(
  slug: string,
  targetDir: string,
): Promise<{ name: string; version: string; description?: string } | null> {
  // Primary: direct HTTP ZIP download (most efficient — 1 download request)
  try {
    return await pullViaHttpApi(slug, targetDir)
  } catch (err) {
    console.error('[clawhub:pull] HTTP download failed:', (err as Error).message)
  }

  // Fallback: CLI (handles authentication edge cases, but uses more rate limit quota).
  // Use --workdir pointing to a writable directory so the CLI can create its
  // .clawhub/ lockfile (default cwd /app is read-only in production containers).
  const parentDir = dirname(targetDir)
  const dataDir = dirname(parentDir) // e.g. /app/data — writable by nextjs user
  try {
    await execFileAsync('clawhub', ['install', slug, '--workdir', dataDir, '--force', '--no-input'], {
      timeout: 60_000,
      env: { ...process.env, CLAWHUB_REGISTRY: CLAWHUB_API_BASE },
    })
    try {
      const metaPath = join(targetDir, '_meta.json')
      const metaRaw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(metaRaw) as { slug: string; version: string }
      return { name: meta.slug || slug, version: meta.version || '1.0.0' }
    } catch {
      return { name: slug, version: '1.0.0' }
    }
  } catch (cliErr) {
    console.error('[clawhub:pull] CLI fallback also failed:', (cliErr as Error).message)
    return null
  }
}

/**
 * Pull a skill by downloading the ZIP archive from the ClawHub HTTP API.
 *
 * The /api/v1/download?slug=... endpoint returns the latest version as a ZIP
 * (no version parameter needed). This uses exactly 1 request from the tight
 * 20-req/60s download rate limit pool.
 *
 * Skill metadata (name, description) comes from the /api/v1/skills/... endpoint
 * which has a separate, generous rate limit pool (120 req/60s).
 */
async function pullViaHttpApi(
  slug: string,
  targetDir: string,
): Promise<{ name: string; version: string; description?: string } | null> {
  // Download the ZIP archive directly — no version needed, returns latest.
  // Use maxRetries: 0 for 429 to avoid wasting the tight 20-request quota.
  const downloadUrl = `${CLAWHUB_API_BASE}/api/v1/download?slug=${encodeURIComponent(slug)}`
  const zipRes = await fetchWithRetry(downloadUrl, { timeoutMs: 60_000, maxRetries: 1 })
  if (!zipRes.ok) {
    throw new Error(`Failed to download skill ZIP: ${zipRes.status}`)
  }

  const zipBytes = new Uint8Array(await zipRes.arrayBuffer())
  if (zipBytes.length === 0) {
    throw new Error('Downloaded ZIP is empty')
  }

  // Extract ZIP to target directory
  const entries = unzipSync(zipBytes)
  await mkdir(targetDir, { recursive: true })

  let fileCount = 0
  let metaJson: { slug?: string; version?: string } | null = null

  for (const [rawPath, data] of Object.entries(entries)) {
    // Sanitize path: strip leading ./ or /, reject path traversal
    const safePath = rawPath.replace(/^\.\/+/, '').replace(/^\/+/, '')
    if (!safePath || safePath.endsWith('/') || safePath.includes('..')) continue

    const outPath = join(targetDir, safePath)
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, data)
    fileCount++

    // Capture _meta.json from ZIP for version info
    if (safePath === '_meta.json') {
      try { metaJson = JSON.parse(new TextDecoder().decode(data)) } catch { /* ignore */ }
    }
  }

  if (fileCount === 0) {
    throw new Error('ZIP contained no extractable files')
  }

  const version = metaJson?.version || '1.0.0'

  // Write _meta.json if not already present in ZIP
  if (!metaJson) {
    const meta = { slug, version, source: 'clawhub-http' }
    await writeFile(join(targetDir, '_meta.json'), JSON.stringify(meta, null, 2), 'utf-8')
  }

  // Get skill info for name/description (120-req pool — separate from download).
  // Non-blocking: failure just means less metadata, the files are already extracted.
  const info = await getClawHubInfo(slug).catch(() => null)

  return {
    name: info?.name || slug,
    version: info?.version || version,
    description: info?.description,
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
      `${CLAWHUB_API_BASE}/api/v1/skills/${encodeURIComponent(slug)}`,
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
        ? `${CLAWHUB_SITE_URL}/${ownerHandle}/${skillSlug}`
        : `${CLAWHUB_SITE_URL}/${skillSlug}`,
    }
    setCachedInfo(slug, info)
    return info
  } catch {
    return null
  }
}
