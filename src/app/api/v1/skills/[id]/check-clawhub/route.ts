import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { getClawHubInfo } from '@/lib/skills/clawhub'

// GET /api/v1/skills/[id]/check-clawhub - Check for ClawHub updates
export const GET = withAuth(
  withPermission('skills:develop', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, slug: true, version: true, source: true, clawhubSlug: true, homepage: true },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }
    if (skill.source !== 'CLAWHUB') {
      return NextResponse.json({ error: 'Only ClawHub skills support checking for updates' }, { status: 400 })
    }

    // Query ClawHub for latest version
    const info = await getClawHubInfo(skill.slug)
    if (!info) {
      return NextResponse.json({
        hasUpdate: false,
        currentVersion: skill.version,
        error: 'Cannot connect to ClawHub or skill not found',
      })
    }

    // Backfill clawhubSlug and homepage if missing or incomplete
    const fullPath = info.ownerHandle ? `${info.ownerHandle}/${info.slug}` : null
    if (fullPath && (!skill.clawhubSlug || !skill.clawhubSlug.includes('/'))) {
      await prisma.skill.update({
        where: { id },
        data: {
          clawhubSlug: fullPath,
          homepage: skill.homepage || info.homepage,
        },
      })
    }

    const hasUpdate = info.version !== skill.version

    return NextResponse.json({
      hasUpdate,
      currentVersion: skill.version,
      latestVersion: info.version,
      latestDescription: info.description,
      clawhubUrl: info.homepage,
    })
  }),
)
