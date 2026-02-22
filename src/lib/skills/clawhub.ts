import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { ClawHubSearchResult } from '@/types/skill'

const execFileAsync = promisify(execFile)

const CLAWHUB_REGISTRY_URL = process.env.CLAWHUB_REGISTRY_URL || 'https://clawhub.ai'

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
      // Need at least owner/slug (2 segments)
      if (path.includes('/')) return path
    }
  } catch {
    // Not a URL
  }
  // "owner/slug" format
  if (trimmed.includes('/') && !trimmed.includes('://')) {
    return trimmed
  }
  return null
}

/**
 * Parse text output from `clawhub search`.
 * Format: "slug vX.Y.Z  description  (score)"
 * First line may be a spinner/progress message like "- Searching"
 */
function parseSearchOutput(stdout: string): ClawHubSearchResult[] {
  const results: ClawHubSearchResult[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    // Skip empty lines and spinner lines
    if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('✔') || trimmed.startsWith('[')) continue

    // Match: slug vX.Y.Z  description  (score)
    const match = trimmed.match(/^(\S+)\s+v(\d+\.\d+\.\d+)\s{2,}(.+?)\s{2,}\([\d.]+\)$/)
    if (match) {
      results.push({
        slug: match[1],
        name: match[1],
        version: match[2],
        description: match[3].trim(),
        author: '',
        tags: [],
        homepage: '',
      })
    }
  }
  return results
}

/**
 * Search ClawHub for skills using the CLI.
 */
export async function searchClawHub(query: string): Promise<ClawHubSearchResult[]> {
  // If query looks like a URL, extract the slug
  const slug = parseClawHubSlug(query)

  try {
    const { stdout } = await execFileAsync('clawhub', ['search', slug], {
      timeout: 15000,
      env: { ...process.env, CLAWHUB_REGISTRY: CLAWHUB_REGISTRY_URL },
    })
    return parseSearchOutput(stdout)
  } catch (err) {
    console.error('[clawhub:search] CLI failed:', (err as Error).message)
    // Fallback: HTTP API
    try {
      const res = await fetch(`${CLAWHUB_REGISTRY_URL}/api/v1/skills/search?q=${encodeURIComponent(slug)}`, {
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) return []
      const data = await res.json() as { skills?: ClawHubSearchResult[] }
      return data.skills ?? []
    } catch {
      return []
    }
  }
}

/**
 * Install a skill from ClawHub to a local directory.
 * Uses `clawhub install <slug> --dir <parentDir>`.
 * The CLI creates `{parentDir}/{slug}/` containing SKILL.md and _meta.json.
 *
 * @param slug - The skill slug (e.g. "xiaohongshutools")
 * @param targetDir - The skill directory (e.g. "data/skills/xiaohongshutools/").
 *                     We pass dirname(targetDir) to the CLI as --dir.
 */
export async function pullClawHubSkill(
  slug: string,
  targetDir: string,
): Promise<{ name: string; version: string; description?: string } | null> {
  const parentDir = dirname(targetDir)

  try {
    await execFileAsync('clawhub', ['install', slug, '--dir', parentDir, '--force'], {
      timeout: 30000,
      env: { ...process.env, CLAWHUB_REGISTRY: CLAWHUB_REGISTRY_URL },
    })

    // Read metadata from _meta.json created by the CLI
    try {
      const metaPath = join(parentDir, slug, '_meta.json')
      const metaRaw = await readFile(metaPath, 'utf-8')
      const meta = JSON.parse(metaRaw) as { slug: string; version: string }
      return {
        name: meta.slug || slug,
        version: meta.version || '1.0.0',
      }
    } catch {
      // _meta.json not found, return basic info
      return { name: slug, version: '1.0.0' }
    }
  } catch (err) {
    console.error('[clawhub:install] CLI failed:', (err as Error).message)
    return null
  }
}

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
 * ClawHub returns: { skill: { slug, displayName, summary }, latestVersion: { version }, owner: { handle } }
 */
export async function getClawHubInfo(
  slug: string,
): Promise<ClawHubSkillInfo | null> {
  try {
    const res = await fetch(`${CLAWHUB_REGISTRY_URL}/api/v1/skills/${encodeURIComponent(slug)}`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json() as {
      skill?: { slug?: string; displayName?: string; summary?: string }
      latestVersion?: { version?: string }
      owner?: { handle?: string }
    }
    const skillSlug = data.skill?.slug || slug
    const ownerHandle = data.owner?.handle || ''
    return {
      slug: skillSlug,
      name: data.skill?.displayName || skillSlug,
      version: data.latestVersion?.version || '0.0.0',
      description: data.skill?.summary || '',
      ownerHandle,
      homepage: ownerHandle
        ? `${CLAWHUB_REGISTRY_URL}/${ownerHandle}/${skillSlug}`
        : `${CLAWHUB_REGISTRY_URL}/${skillSlug}`,
    }
  } catch {
    return null
  }
}
