import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withAuth, withPermission } from '@/lib/middleware/auth'
import { getDisplayName } from '@/lib/utils/display-name'

// GET /api/v1/audit-logs/export — Export audit logs as CSV (SYSTEM_ADMIN only)
export const GET = withAuth(
  withPermission('audit:view_all', async (req) => {
    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')
    const action = url.searchParams.get('action')
    const resource = url.searchParams.get('resource')
    const result = url.searchParams.get('result')

    const where: Record<string, unknown> = {}
    if (action) where.action = action
    if (resource) where.resource = resource
    if (result) where.result = result
    if (startDate || endDate) {
      const createdAt: Record<string, Date> = {}
      if (startDate) createdAt.gte = new Date(startDate)
      if (endDate) createdAt.lte = new Date(endDate)
      where.createdAt = createdAt
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10000,
    })

    const BOM = '\uFEFF'
    const header = '时间,用户,操作,资源类型,资源ID,结果,IP地址,详情'
    const rows = logs.map((log) => {
      const time = log.createdAt.toISOString()
      const userName = csvEscape(getDisplayName(log.user))
      const actionCol = csvEscape(log.action)
      const resourceCol = csvEscape(log.resource)
      const resourceId = csvEscape(log.resourceId ?? '')
      const resultCol = csvEscape(log.result)
      const ip = csvEscape(log.ipAddress)
      const details = csvEscape(log.details ? JSON.stringify(log.details) : '')
      return `${time},${userName},${actionCol},${resourceCol},${resourceId},${resultCol},${ip},${details}`
    })

    const csv = BOM + header + '\n' + rows.join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }),
)

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
