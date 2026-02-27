import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission, param } from '@/lib/middleware/auth'

// GET /api/v1/skills/[id]/installations - List installations for a skill
export const GET = withAuth(
  withPermission('skills:develop', async (_req, ctx) => {
    const id = param(ctx, 'id')
    if (!id) {
      return NextResponse.json({ error: 'Missing skill ID' }, { status: 400 })
    }

    // Verify skill exists
    const skill = await prisma.skill.findUnique({
      where: { id },
      select: { id: true, slug: true, name: true },
    })
    if (!skill) {
      return NextResponse.json({ error: 'Skill not found' }, { status: 404 })
    }

    const installations = await prisma.skillInstallation.findMany({
      where: { skillId: id },
      include: {
        instance: { select: { id: true, name: true, status: true } },
        installedBy: { select: { id: true, name: true } },
      },
      orderBy: { installedAt: 'desc' },
    })

    return NextResponse.json({
      installations: installations.map((inst) => ({
        id: inst.id,
        skillId: inst.skillId,
        instanceId: inst.instanceId,
        instanceName: inst.instance.name,
        instanceStatus: inst.instance.status,
        agentId: inst.agentId,
        installedVersion: inst.installedVersion,
        installPath: inst.installPath,
        installedById: inst.installedBy.id,
        installedByName: inst.installedBy.name,
        installedAt: inst.installedAt.toISOString(),
        updatedAt: inst.updatedAt.toISOString(),
      })),
    })
  }),
)
