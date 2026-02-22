import { NextResponse } from 'next/server'
import type { Prisma } from '@/generated/prisma'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { getDisplayName } from '@/lib/utils/display-name'
import type { AuditLogEntry, AuditLogListResponse } from '@/types/audit'

// GET /api/v1/audit-logs — List audit logs with filtering + pagination
export const GET = withAuth(
  withPermission('audit:view_dept', async (req, ctx) => {
    const { user } = ctx
    const url = new URL(req.url)

    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'))
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50')))
    const search = url.searchParams.get('search')?.trim().slice(0, 100)
    const action = url.searchParams.get('action')
    const resource = url.searchParams.get('resource')
    const result = url.searchParams.get('result')
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    const where: Prisma.AuditLogWhereInput = {}

    // DEPT_ADMIN: scope to department members only
    if (user.role === 'DEPT_ADMIN' && user.departmentId) {
      const deptUsers = await prisma.user.findMany({
        where: { departmentId: user.departmentId },
        select: { id: true },
      })
      where.userId = { in: deptUsers.map((u) => u.id) }
    }

    if (action) where.action = action
    if (resource) where.resource = resource
    if (result) where.result = result

    if (startDate || endDate) {
      where.createdAt = {}
      if (startDate) where.createdAt.gte = new Date(startDate)
      if (endDate) where.createdAt.lte = new Date(endDate)
    }

    if (search) {
      where.OR = [
        { action: { contains: search, mode: 'insensitive' } },
        { resource: { contains: search, mode: 'insensitive' } },
        { resourceId: { contains: search, mode: 'insensitive' } },
        { user: { name: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
      ]
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ])

    const items: AuditLogEntry[] = logs.map((log) => ({
      id: log.id,
      userId: log.userId,
      userName: getDisplayName(log.user),
      action: log.action,
      resource: log.resource,
      resourceId: log.resourceId,
      details: log.details as Record<string, unknown> | null,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      result: log.result,
      createdAt: log.createdAt.toISOString(),
    }))

    const response: AuditLogListResponse = {
      logs: items,
      total,
      page,
      pageSize,
    }

    return NextResponse.json(response)
  }),
)
