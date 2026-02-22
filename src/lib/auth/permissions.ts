import { Role } from '@/generated/prisma'

export interface PermissionConfig {
  roles: Role[]
  resourceCheck?: boolean
}

const ALL_ROLES: Role[] = [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN, Role.USER]

export const ROUTE_PERMISSIONS: Record<string, PermissionConfig> = {
  // Users
  'users:create': { roles: [Role.SYSTEM_ADMIN] },
  'users:update': { roles: [Role.SYSTEM_ADMIN] },
  'users:delete': { roles: [Role.SYSTEM_ADMIN] },
  'users:list': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },
  'users:reset_password': { roles: [Role.SYSTEM_ADMIN] },

  // Departments
  'departments:manage': { roles: [Role.SYSTEM_ADMIN] },
  'departments:view': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },

  // Instance Access
  'instance_access:manage': { roles: [Role.SYSTEM_ADMIN] },

  // Agents
  'agents:manage': { roles: [Role.SYSTEM_ADMIN] },
  'agents:view': { roles: ALL_ROLES },
  'agents:create': { roles: ALL_ROLES },
  'agents:classify': { roles: [Role.SYSTEM_ADMIN] },
  'agents:manage_dept': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },

  // Sessions
  'sessions:view_all': { roles: [Role.SYSTEM_ADMIN] },
  'sessions:view_dept': {
    roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN],
    resourceCheck: true,
  },
  'sessions:view_own': { roles: ALL_ROLES },

  // Skills
  'skills:manage_global': { roles: [Role.SYSTEM_ADMIN] },
  'skills:manage_dept': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },
  'skills:develop': { roles: ALL_ROLES },

  // Models
  'models:manage': { roles: [Role.SYSTEM_ADMIN] },
  'models:view': { roles: ALL_ROLES },

  // Config
  'config:manage': { roles: [Role.SYSTEM_ADMIN] },

  // Audit
  'audit:view_all': { roles: [Role.SYSTEM_ADMIN] },
  'audit:view_dept': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },

  // Approvals
  'approvals:review': { roles: [Role.SYSTEM_ADMIN] },
  'approvals:create': { roles: ALL_ROLES },

  // Channels
  'channels:manage': { roles: [Role.SYSTEM_ADMIN] },
  'channels:view': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },

  // Chat
  'chat:use': { roles: ALL_ROLES },

  // Monitor
  'monitor:view': { roles: [Role.SYSTEM_ADMIN] },
  'monitor:view_basic': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },

  // Usage
  'usage:view_all': { roles: [Role.SYSTEM_ADMIN] },
  'usage:view_dept': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },
  'usage:view_own': { roles: ALL_ROLES },

  // Instances
  'instances:manage': { roles: [Role.SYSTEM_ADMIN] },
  'instances:view': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },

  // API Keys
  'api_keys:manage': { roles: ALL_ROLES },

  // Knowledge
  'knowledge:manage_global': { roles: [Role.SYSTEM_ADMIN] },
  'knowledge:manage_dept': { roles: [Role.SYSTEM_ADMIN, Role.DEPT_ADMIN] },
  'knowledge:view': { roles: ALL_ROLES },

  // Resources
  'resources:manage': { roles: [Role.SYSTEM_ADMIN] },
}

export function hasPermission(role: string, permission: string): boolean {
  const config = ROUTE_PERMISSIONS[permission]
  if (!config) return false
  return config.roles.includes(role as Role)
}

export function getPermissionConfig(
  permission: string
): PermissionConfig | undefined {
  return ROUTE_PERMISSIONS[permission]
}
