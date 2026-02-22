export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  departmentId: string | null
  departmentName: string | null
  avatar: string | null
}

export interface JWTPayload {
  userId: string
  role: string
}
