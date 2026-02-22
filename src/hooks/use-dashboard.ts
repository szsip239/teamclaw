"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { DashboardResponse } from "@/types/dashboard"

export const dashboardKeys = {
  all: ["dashboard"] as const,
  stats: () => [...dashboardKeys.all, "stats"] as const,
}

export function useDashboardStats(enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: () => api.get<DashboardResponse>("/api/v1/dashboard"),
    refetchInterval: 60_000,
    enabled,
  })
}
