import type { Role, UserStatus } from '@/generated/prisma'

export interface UserResponse {
  id: string
  email: string
  name: string
  avatar: string | null
  role: Role
  departmentId: string | null
  departmentName: string | null
  status: UserStatus
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserListResponse {
  users: UserResponse[]
  total: number
  page: number
  pageSize: number
}
