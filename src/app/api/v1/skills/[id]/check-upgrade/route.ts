import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'
import { canInstallToAgent } from '@/lib/skills/permissions'

// GET /api/v1/skills/[id]/check-upgrade - Check if installed versions are outdated
export const GET = withAuth(
  withPermission('skills:develop', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: '缺少技能 ID' }, { status: 400 })
    }

    // Find skill with current version
    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true, version: true },
    })
    if (!skill) {
      return NextResponse.json({ error: '技能不存在' }, { status: 404 })
    }

    // Find all installations
    const installations = await prisma.skillInstallation.findMany({
      where: { skillId: id },
      include: {
        instance: { select: { id: true, name: true, status: true } },
        installedBy: { select: { id: true, name: true } },
      },
      orderBy: { installedAt: 'desc' },
    })

    // Find all outdated installations (version mismatch)
    const allOutdated = installations.filter(
      (inst) => inst.installedVersion !== skill.version,
    )

    // Permission filter: only show installations the user can upgrade
    const agentMetaCache = new Map<string, Awaited<ReturnType<typeof prisma.agentMeta.findUnique>>>()
    const upgradeable: typeof allOutdated = []

    for (const inst of allOutdated) {
      const cacheKey = `${inst.instanceId}:${inst.agentId}`
      let agentMeta = agentMetaCache.get(cacheKey)
      if (agentMeta === undefined) {
        agentMeta = await prisma.agentMeta.findUnique({
          where: { instanceId_agentId: { instanceId: inst.instanceId, agentId: inst.agentId } },
        })
        agentMetaCache.set(cacheKey, agentMeta)
      }
      if (canInstallToAgent(agentMeta, ctx.user)) {
        upgradeable.push(inst)
      }
    }

    return NextResponse.json({
      currentVersion: skill.version,
      totalInstallations: installations.length,
      totalOutdated: allOutdated.length,
      upgradeableCount: upgradeable.length,
      outdated: upgradeable.map((inst) => ({
        id: inst.id,
        instanceId: inst.instanceId,
        instanceName: inst.instance.name,
        instanceStatus: inst.instance.status,
        agentId: inst.agentId,
        installedVersion: inst.installedVersion,
        installPath: inst.installPath,
        installedByName: inst.installedBy.name,
        installedAt: inst.installedAt.toISOString(),
      })),
    })
  }),
)
