type Role = 'SYSTEM_ADMIN' | 'DEPT_ADMIN' | 'USER'

export interface PermissionConfig {
  roles: Role[]
  resourceCheck?: boolean
}

const ALL_ROLES: Role[] = ['SYSTEM_ADMIN', 'DEPT_ADMIN', 'USER']

export const ROUTE_PERMISSIONS: Record<string, PermissionConfig> = {
  // Users
  'users:create': { roles: ['SYSTEM_ADMIN'] },
  'users:update': { roles: ['SYSTEM_ADMIN'] },
  'users:delete': { roles: ['SYSTEM_ADMIN'] },
  'users:list': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },
  'users:reset_password': { roles: ['SYSTEM_ADMIN'] },

  // Departments
  'departments:manage': { roles: ['SYSTEM_ADMIN'] },
  'departments:view': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },

  // Instance Access
  'instance_access:manage': { roles: ['SYSTEM_ADMIN'] },

  // Agents
  'agents:manage': { roles: ['SYSTEM_ADMIN'] },
  'agents:view': { roles: ALL_ROLES },
  'agents:create': { roles: ALL_ROLES },
  'agents:classify': { roles: ['SYSTEM_ADMIN'] },
  'agents:manage_dept': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },

  // Sessions
  'sessions:view_all': { roles: ['SYSTEM_ADMIN'] },
  'sessions:view_dept': {
    roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'],
    resourceCheck: true,
  },
  'sessions:view_own': { roles: ALL_ROLES },

  // Skills
  'skills:manage_global': { roles: ['SYSTEM_ADMIN'] },
  'skills:manage_dept': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },
  'skills:develop': { roles: ALL_ROLES },

  // Models
  'models:manage': { roles: ['SYSTEM_ADMIN'] },
  'models:view': { roles: ALL_ROLES },

  // Config
  'config:manage': { roles: ['SYSTEM_ADMIN'] },

  // Audit
  'audit:view_all': { roles: ['SYSTEM_ADMIN'] },
  'audit:view_dept': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },

  // Approvals
  'approvals:review': { roles: ['SYSTEM_ADMIN'] },
  'approvals:create': { roles: ALL_ROLES },

  // Channels
  'channels:manage': { roles: ['SYSTEM_ADMIN'] },
  'channels:view': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },

  // Chat
  'chat:use': { roles: ALL_ROLES },

  // Monitor
  'monitor:view': { roles: ['SYSTEM_ADMIN'] },
  'monitor:view_basic': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },

  // Usage
  'usage:view_all': { roles: ['SYSTEM_ADMIN'] },
  'usage:view_dept': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },
  'usage:view_own': { roles: ALL_ROLES },

  // Instances
  'instances:manage': { roles: ['SYSTEM_ADMIN'] },
  'instances:view': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },

  // API Keys
  'api_keys:manage': { roles: ALL_ROLES },

  // Knowledge
  'knowledge:manage_global': { roles: ['SYSTEM_ADMIN'] },
  'knowledge:manage_dept': { roles: ['SYSTEM_ADMIN', 'DEPT_ADMIN'] },
  'knowledge:view': { roles: ALL_ROLES },

  // Resources
  'resources:manage': { roles: ['SYSTEM_ADMIN'] },
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
