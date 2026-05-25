import { NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join, relative } from 'path'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { isSkillVisible } from '@/lib/skills/permissions'
import { listSkillFiles, resolveSkillDir } from '@/lib/skills/fs'
import type { SkillFileEntry } from '@/types/skill'

// GET /api/v1/skills/[id]/files — List files in skill directory
export const GET = withAuth(
  withPermission('skills:develop', async (req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      include: { departments: { select: { id: true } } },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    // Visibility check
    if (!isSkillVisible(skill, ctx.user)) {
      return NextResponse.json({ error: 'No access to this skill' }, { status: 403 })
    }

    // Optional subdirectory
    const url = new URL(req.url)
    const dir = url.searchParams.get('dir') || undefined
    if (dir && dir.includes('..')) {
      return NextResponse.json({ error: 'Illegal path' }, { status: 400 })
    }

    try {
      // For INSTANCE skills, list from the instance workspace; otherwise
      // read from the local data/skills/ tree.
      let files: SkillFileEntry[]
      if (skill.source === 'INSTANCE') {
        const base = await resolveSkillDir(skill.slug)
        const target = dir ? join(base, dir) : base
        const entries = await readdir(target, { withFileTypes: true })
        files = await Promise.all(
          entries
            .sort((a, b) => {
              if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
              return a.name.localeCompare(b.name)
            })
            .map(async (ent) => {
              const relPath = relative(base, join(target, ent.name))
              const entry: SkillFileEntry = { name: ent.name, path: relPath, type: ent.isDirectory() ? 'directory' : 'file' }
              if (!ent.isDirectory()) {
                try {
                  const st = await stat(join(target, ent.name))
                  entry.size = st.size
                } catch { /* ignore */ }
              }
              return entry
            }),
        )
      } else {
        files = await listSkillFiles(skill.slug, dir)
      }
      return NextResponse.json({ files, slug: skill.slug, dir: dir ?? '' })
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to read directory:${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
