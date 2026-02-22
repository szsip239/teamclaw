import type { SkillCategory } from '@/types/skill'
import type { AuthUser } from '@/types/auth'
import type { AgentMeta } from '@/generated/prisma'

/** Check if a skill is visible to a user based on its category */
export function isSkillVisible(
  skill: { category: string; departments?: { id: string }[]; creatorId: string },
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (skill.category === 'DEFAULT') return true
  if (skill.category === 'DEPARTMENT') {
    const depts = skill.departments ?? []
    return !!user.departmentId && depts.some((d) => d.id === user.departmentId)
  }
  if (skill.category === 'PERSONAL') {
    return skill.creatorId === user.id
  }
  return false
}

/** Check if user can create a skill with the given category */
export function canCreateSkillWithCategory(
  role: string,
  category: SkillCategory,
  userDepartmentId: string | null,
  targetDepartmentIds?: string[],
): boolean {
  if (role === 'SYSTEM_ADMIN') return true
  if (category === 'DEFAULT') return false
  if (category === 'DEPARTMENT') {
    if (role !== 'DEPT_ADMIN') return false
    // DEPT_ADMIN can only assign to own department
    if (!targetDepartmentIds || targetDepartmentIds.length === 0) return true
    return targetDepartmentIds.every((id) => id === userDepartmentId)
  }
  return true // PERSONAL: all roles
}

/** Check if user can edit a skill */
export function canEditSkill(
  skill: { category: string; departments?: { id: string }[]; creatorId: string },
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (skill.category === 'PERSONAL' && skill.creatorId === user.id) return true
  if (skill.category === 'DEPARTMENT' && user.role === 'DEPT_ADMIN') {
    const depts = skill.departments ?? []
    return !!user.departmentId && depts.some((d) => d.id === user.departmentId)
  }
  return false
}

/** Check if user can install a skill to a specific agent */
export function canInstallToAgent(
  agentMeta: AgentMeta | null,
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (!agentMeta) return false

  if (agentMeta.category === 'DEFAULT') return false // Only SYSTEM_ADMIN
  if (agentMeta.category === 'DEPARTMENT') {
    if (user.role !== 'DEPT_ADMIN' && user.role !== 'SYSTEM_ADMIN') return false
    return !!user.departmentId && agentMeta.departmentId === user.departmentId
  }
  if (agentMeta.category === 'PERSONAL') {
    return agentMeta.ownerId === user.id
  }
  return false
}

/** Get default category based on role */
export function getDefaultSkillCategory(role: string): SkillCategory {
  if (role === 'SYSTEM_ADMIN') return 'DEFAULT'
  if (role === 'DEPT_ADMIN') return 'DEPARTMENT'
  return 'PERSONAL'
}
