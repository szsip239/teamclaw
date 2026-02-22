export interface DepartmentResponse {
  id: string
  name: string
  description: string | null
  userCount: number
  accessCount: number
  createdAt: string
  updatedAt: string
}

export interface DepartmentDetailResponse extends DepartmentResponse {
  users: {
    id: string
    name: string
    email: string
    role: string
    status: string
    avatar: string | null
  }[]
  instanceAccess: {
    id: string
    instanceId: string
    instanceName: string
    instanceStatus: string
    agentIds: string[] | null
    grantedByName: string
    createdAt: string
  }[]
}
