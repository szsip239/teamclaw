import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { getDisplayName } from '@/lib/utils/display-name'
import { getProvider } from '@/lib/resources/providers'
import type { DashboardResponse, InstanceHealthCard, ProviderDistribution, RecentActivity } from '@/types/dashboard'

// GET /api/v1/dashboard — Dashboard aggregated stats
export const GET = withAuth(
  withPermission('monitor:view_basic', async (_req, ctx) => {
    const { user } = ctx

    // DEPT_ADMIN: scope to accessible instances
    let instanceFilter: { id?: { in: string[] } } | undefined
    if (user.role === 'DEPT_ADMIN' && user.departmentId) {
      const access = await prisma.instanceAccess.findMany({
        where: { departmentId: user.departmentId },
        select: { instanceId: true },
      })
      instanceFilter = { id: { in: access.map((a) => a.instanceId) } }
    }

    const [
      totalInstances,
      onlineInstances,
      totalUsers,
      activeUsers,
      totalSessions,
      totalResources,
      totalSkills,
      instances,
      recentLogs,
    ] = await Promise.all([
      prisma.instance.count({ where: instanceFilter }),
      prisma.instance.count({ where: { ...instanceFilter, status: 'ONLINE' } }),
      user.role === 'SYSTEM_ADMIN'
        ? prisma.user.count({ where: { status: 'ACTIVE' } })
        : prisma.user.count({
            where: { status: 'ACTIVE', departmentId: user.departmentId },
          }),
      user.role === 'SYSTEM_ADMIN'
        ? prisma.user.count({
            where: {
              status: 'ACTIVE',
              lastLoginAt: { gte: new Date(Date.now() - 7 * 86400000) },
            },
          })
        : prisma.user.count({
            where: {
              status: 'ACTIVE',
              departmentId: user.departmentId,
              lastLoginAt: { gte: new Date(Date.now() - 7 * 86400000) },
            },
          }),
      prisma.chatSession.count(),
      user.role === 'SYSTEM_ADMIN' ? prisma.resource.count() : Promise.resolve(0),
      prisma.skill.count(),
      prisma.instance.findMany({
        where: instanceFilter,
        select: {
          id: true,
          name: true,
          status: true,
          version: true,
          healthData: true,
          lastHealthCheck: true,
          _count: { select: { chatSessions: true } },
        },
        orderBy: { name: 'asc' },
        take: 20,
      }),
      prisma.auditLog.findMany({
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ])

    // Build instance health cards
    const instanceHealth: InstanceHealthCard[] = instances.map((inst) => {
      const hd = inst.healthData as Record<string, unknown> | null
      const agents = Array.isArray(hd?.agents) ? (hd.agents as unknown[]) : []
      return {
        id: inst.id,
        name: inst.name,
        status: inst.status,
        version: inst.version,
        agentCount: agents.length,
        sessionCount: inst._count.chatSessions,
        lastHealthCheck: inst.lastHealthCheck?.toISOString() ?? null,
      }
    })

    // Build provider distribution (SYSTEM_ADMIN only)
    let providerDistribution: ProviderDistribution[] = []
    if (user.role === 'SYSTEM_ADMIN') {
      const grouped = await prisma.resource.groupBy({
        by: ['provider'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      })
      providerDistribution = grouped.map((g) => ({
        provider: g.provider,
        providerName: getProvider(g.provider)?.name ?? g.provider,
        count: g._count.id,
      }))
    }

    // Build recent activity
    const recentActivity: RecentActivity[] = recentLogs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: getDisplayName(log.user),
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      result: log.result,
      createdAt: log.createdAt.toISOString(),
    }))

    const response: DashboardResponse = {
      stats: {
        totalInstances,
        onlineInstances,
        totalUsers,
        activeUsers,
        totalSessions,
        totalResources,
        totalSkills,
      },
      instanceHealth,
      providerDistribution,
      recentActivity,
    }

    return NextResponse.json(response)
  }),
)
