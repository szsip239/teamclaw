import { prisma } from '@/lib/db'

/**
 * Write an audit log entry. Best-effort: failures are logged to console
 * but do not block the calling request. This is an intentional tradeoff
 * for performance — security-critical actions should verify the audit
 * write succeeded if compliance requirements demand it.
 */
export function auditLog(params: {
  userId: string
  action: string
  resource: string
  resourceId?: string
  details?: Record<string, string | number | boolean | null>
  ipAddress: string
  userAgent?: string
  result: 'SUCCESS' | 'FAILURE' | 'DENIED'
}): void {
  prisma.auditLog
    .create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        details: params.details ?? undefined,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        result: params.result,
      },
    })
    .catch((err) => {
      console.error('Failed to write audit log:', err)
    })
}
