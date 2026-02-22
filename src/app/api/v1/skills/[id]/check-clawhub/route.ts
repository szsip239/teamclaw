import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { getClawHubInfo } from '@/lib/skills/clawhub'

// GET /api/v1/skills/[id]/check-clawhub - Check for ClawHub updates
export const GET = withAuth(
  withPermission('skills:develop', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少技能 ID' }, { status: 400 })
    }

    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, slug: true, version: true, source: true, clawhubSlug: true, homepage: true },
    })
    if (!skill) {
      return NextResponse.json({ error: '技能不存在' }, { status: 404 })
    }
    if (skill.source !== 'CLAWHUB') {
      return NextResponse.json({ error: '仅 ClawHub 来源的技能支持检查更新' }, { status: 400 })
    }

    // Query ClawHub for latest version
    const info = await getClawHubInfo(skill.slug)
    if (!info) {
      return NextResponse.json({
        hasUpdate: false,
        currentVersion: skill.version,
        error: '无法连接 ClawHub 或未找到该技能',
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
