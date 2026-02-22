export interface AuditLogEntry {
  id: string
  userId: string
  userName: string
  action: string
  resource: string
  resourceId: string | null
  details: Record<string, unknown> | null
  ipAddress: string
  userAgent: string | null
  result: string
  createdAt: string
}

export interface AuditLogListResponse {
  logs: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
}
