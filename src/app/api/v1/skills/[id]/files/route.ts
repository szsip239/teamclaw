import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { isSkillVisible } from '@/lib/skills/permissions'
import { listSkillFiles } from '@/lib/skills/fs'

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
      const files = await listSkillFiles(skill.slug, dir)
      return NextResponse.json({ files, slug: skill.slug, dir: dir ?? '' })
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to read directory:${(err as Error).message}` },
        { status: 500 },
      )
    }
  }),
)
