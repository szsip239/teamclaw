export interface DashboardStats {
  totalInstances: number
  onlineInstances: number
  totalUsers: number
  activeUsers: number
  totalSessions: number
  totalResources: number
  totalSkills: number
}

export interface InstanceHealthCard {
  id: string
  name: string
  status: string
  version: string | null
  agentCount: number
  sessionCount: number
  lastHealthCheck: string | null
}

export interface ProviderDistribution {
  provider: string
  providerName: string
  count: number
}

export interface RecentActivity {
  id: string
  userId: string
  userName: string
  action: string
  resource: string
  resourceId: string | null
  result: string
  createdAt: string
}

export interface DashboardResponse {
  stats: DashboardStats
  instanceHealth: InstanceHealthCard[]
  providerDistribution: ProviderDistribution[]
  recentActivity: RecentActivity[]
}
