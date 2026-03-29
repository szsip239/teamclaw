import type { AuthUser } from '@/types/auth'
import type { KbScope } from '@/types/knowledge-base'

/**
 * Check if a knowledge base is visible to a user.
 * Follows the same tri-level pattern as isAgentVisible in agents/helpers.ts.
 */
export function isKbVisible(
  kb: { scope: KbScope; departmentId: string | null; createdById: string },
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (kb.scope === 'GLOBAL') return true
  if (kb.scope === 'DEPARTMENT') {
    return !!user.departmentId && kb.departmentId === user.departmentId
  }
  if (kb.scope === 'PERSONAL') {
    return kb.createdById === user.id
  }
  return false
}

/**
 * Check if a user can manage (edit/delete) a knowledge base.
 */
export function canManageKb(
  kb: { scope: KbScope; departmentId: string | null; createdById: string },
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (kb.scope === 'GLOBAL') return false // Only SYSTEM_ADMIN
  if (kb.scope === 'DEPARTMENT') {
    return (
      user.role === 'DEPT_ADMIN' && !!user.departmentId && kb.departmentId === user.departmentId
    )
  }
  if (kb.scope === 'PERSONAL') {
    return kb.createdById === user.id
  }
  return false
}

/**
 * Build Prisma WHERE clause for listing KBs visible to a user.
 */
export function kbListWhereClause(user: AuthUser) {
  if (user.role === 'SYSTEM_ADMIN') return {}

  const conditions: Record<string, unknown>[] = [
    { scope: 'GLOBAL' },
    { scope: 'PERSONAL', createdById: user.id },
  ]

  if (user.departmentId) {
    conditions.push({ scope: 'DEPARTMENT', departmentId: user.departmentId })
  }

  return { OR: conditions }
}
