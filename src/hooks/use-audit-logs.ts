"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { AuditLogListResponse } from "@/types/audit"

export const auditKeys = {
  all: ["audit-logs"] as const,
  lists: () => [...auditKeys.all, "list"] as const,
  list: (params?: Record<string, string>) =>
    [...auditKeys.lists(), params ?? {}] as const,
}

export interface AuditLogParams {
  page?: number
  pageSize?: number
  search?: string
  action?: string
  resource?: string
  result?: string
  startDate?: string
  endDate?: string
}

export function useAuditLogs(params?: AuditLogParams) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set("page", String(params.page))
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params?.search) qs.set("search", params.search)
  if (params?.action) qs.set("action", params.action)
  if (params?.resource) qs.set("resource", params.resource)
  if (params?.result) qs.set("result", params.result)
  if (params?.startDate) qs.set("startDate", params.startDate)
  if (params?.endDate) qs.set("endDate", params.endDate)

  const qsStr = qs.toString()
  return useQuery({
    queryKey: auditKeys.list(params as Record<string, string> | undefined),
    queryFn: () =>
      api.get<AuditLogListResponse>(
        `/api/v1/audit-logs${qsStr ? `?${qsStr}` : ""}`,
      ),
  })
}
