"use client"

import { useState, useCallback } from "react"
import { useAuthStore } from "@/stores/auth-store"
import { useAuditLogs, type AuditLogParams } from "@/hooks/use-audit-logs"
import { AuditLogFilters } from "@/components/audit/audit-log-filters"
import { AuditLogTable } from "@/components/audit/audit-log-table"

export default function LogsPage() {
  const user = useAuthStore((s) => s.user)
  const [filters, setFilters] = useState<AuditLogParams>({
    page: 1,
    pageSize: 50,
  })

  const { data, isLoading } = useAuditLogs(filters)

  const handleExport = useCallback(() => {
    const qs = new URLSearchParams()
    if (filters.action) qs.set("action", filters.action)
    if (filters.resource) qs.set("resource", filters.resource)
    if (filters.result) qs.set("result", filters.result)
    if (filters.startDate) qs.set("startDate", filters.startDate)
    if (filters.endDate) qs.set("endDate", filters.endDate)
    const qsStr = qs.toString()
    window.open(`/api/v1/audit-logs/export${qsStr ? `?${qsStr}` : ""}`, "_blank")
  }, [filters])

  return (
    <div className="space-y-4 p-6">
      <AuditLogFilters
        filters={filters}
        onChange={setFilters}
        showExport={user?.role === "SYSTEM_ADMIN"}
        onExport={handleExport}
      />
      <AuditLogTable
        logs={data?.logs ?? []}
        total={data?.total ?? 0}
        page={data?.page ?? 1}
        pageSize={data?.pageSize ?? 50}
        isLoading={isLoading}
        onPageChange={(page) => setFilters((f) => ({ ...f, page }))}
      />
    </div>
  )
}
