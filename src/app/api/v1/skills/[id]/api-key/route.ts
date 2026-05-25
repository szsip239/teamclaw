import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import type { AuthContext } from '@/lib/middleware/auth'
import { isSkillVisible } from '@/lib/skills/permissions'
import { parseFrontmatter, findInstanceSkillDir } from '@/lib/skills/fs'

interface OpenClawConfig {
  skills?: {
    entries?: Record<string, { enabled?: boolean; apiKey?: string; env?: Record<string, string> }>
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return '****'
  return key.slice(0, 3) + '***' + key.slice(-3)
}

/** Find and read the openclaw.json for an instance workspace. */
async function readOpenClawConfig(workspacePath: string): Promise<OpenClawConfig> {
  const configPath = join(workspacePath, 'openclaw.json')
  try {
    const raw = await readFile(configPath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeOpenClawConfig(workspacePath: string, config: OpenClawConfig): Promise<void> {
  const configPath = join(workspacePath, 'openclaw.json')
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

// GET /api/v1/skills/[id]/api-key
export const GET = withAuth(
  withPermission('skills:develop', async (_req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    if (!id) return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })

    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, slug: true, frontmatter: true, source: true, category: true, creatorId: true, departments: { select: { id: true } } },
    })
    if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    if (!isSkillVisible(skill, ctx.user)) {
      return NextResponse.json({ error: 'No access' }, { status: 403 })
    }

    // Detect primaryEnv from frontmatter metadata.
    // For INSTANCE skills the DB frontmatter may be null — fall back to
    // reading SKILL.md directly from the instance workspace.
    let primaryEnv: string | null = null
    try {
      let fm = skill.frontmatter as Record<string, unknown> | null
      if (!fm) {
        const instDir = await findInstanceSkillDir(skill.slug)
        if (instDir) {
          const raw = await readFile(join(instDir, 'SKILL.md'), 'utf-8')
          fm = parseFrontmatter(raw)
        }
      }
      const metaRaw = fm?.metadata
      if (metaRaw) {
        const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw
        primaryEnv = (meta as any)?.openclaw?.primaryEnv ?? (meta as any)?.primaryEnv ?? null
      }
    } catch { /* ignore */ }

    if (!primaryEnv) {
      return NextResponse.json({ primaryEnv: null, hasKey: false, maskedKey: null })
    }

    // Try reading from instance workspace openclaw.json
    const instance = await prisma.instance.findFirst({
      where: { workspacePath: { not: null } },
      select: { workspacePath: true },
    })
    let config: OpenClawConfig = {}
    if (instance?.workspacePath) {
      config = await readOpenClawConfig(instance.workspacePath)
    }
    const entry = config?.skills?.entries?.[skill.slug]
    const apiKey = entry?.apiKey ?? entry?.env?.[primaryEnv] ?? ''

    return NextResponse.json({
      primaryEnv,
      hasKey: !!apiKey,
      maskedKey: apiKey ? maskKey(apiKey) : null,
    })
  }),
)

// PUT /api/v1/skills/[id]/api-key
export const PUT = withAuth(
  withPermission('skills:develop', async (req: NextRequest, ctx: AuthContext) => {
    const id = param(ctx, 'id')
    if (!id) return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })

    let body: { apiKey?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (!body.apiKey || typeof body.apiKey !== 'string') {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 })
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, slug: true, frontmatter: true, source: true, category: true, creatorId: true, departments: { select: { id: true } } },
    })
    if (!skill) return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    if (!isSkillVisible(skill, ctx.user)) {
      return NextResponse.json({ error: 'No access' }, { status: 403 })
    }

    // Detect primaryEnv (same fallback logic as GET)
    let primaryEnv: string | null = null
    try {
      let fm = skill.frontmatter as Record<string, unknown> | null
      if (!fm) {
        const instDir = await findInstanceSkillDir(skill.slug)
        if (instDir) {
          const raw = await readFile(join(instDir, 'SKILL.md'), 'utf-8')
          fm = parseFrontmatter(raw)
        }
      }
      const metaRaw = fm?.metadata
      if (metaRaw) {
        const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw
        primaryEnv = (meta as any)?.openclaw?.primaryEnv ?? (meta as any)?.primaryEnv ?? null
      }
    } catch { /* ignore */ }

    if (!primaryEnv) {
      return NextResponse.json({ error: 'This skill does not require an API key' }, { status: 400 })
    }

    // Find an instance workspace
    const instance = await prisma.instance.findFirst({
      where: { workspacePath: { not: null } },
      select: { workspacePath: true },
    })
    if (!instance?.workspacePath) {
      return NextResponse.json({ error: 'No instance workspace found' }, { status: 500 })
    }

    const config = await readOpenClawConfig(instance.workspacePath)
    if (!config.skills) config.skills = { entries: {} }
    if (!config.skills.entries) config.skills.entries = {}
    if (!config.skills.entries[skill.slug]) config.skills.entries[skill.slug] = {}

    const entry = config.skills.entries[skill.slug]
    entry.apiKey = body.apiKey
    entry.enabled = true

    await writeOpenClawConfig(instance.workspacePath, config)

    return NextResponse.json({ success: true, primaryEnv, maskedKey: maskKey(body.apiKey) })
  }),
)
