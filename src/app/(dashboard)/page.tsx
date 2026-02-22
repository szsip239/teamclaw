"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/auth-store"
import { useDashboardStats } from "@/hooks/use-dashboard"
import { DashboardStatsRow } from "@/components/dashboard/dashboard-stats-row"
import { DashboardInstanceHealth } from "@/components/dashboard/dashboard-instance-health"
import { DashboardProviderChart } from "@/components/dashboard/dashboard-provider-chart"
import { DashboardRecentActivity } from "@/components/dashboard/dashboard-recent-activity"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"

export default function DashboardPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const isLoading = useAuthStore((s) => s.isLoading)

  // USER role → redirect to chat (preserve existing behavior)
  useEffect(() => {
    if (!isLoading && user?.role === "USER") {
      router.replace("/chat")
    }
  }, [user, isLoading, router])

  // Wait for auth before firing API call — avoids concurrent refresh token race
  const canFetch = !isLoading && !!user && user.role !== "USER"
  const { data, isLoading: statsLoading } = useDashboardStats(canFetch)

  // While auth is loading or user is USER (about to redirect)
  if (isLoading || !user || user.role === "USER") {
    return null
  }

  if (statsLoading || !data) {
    return (
      <div className="p-6">
        <DashboardSkeleton />
      </div>
    )
  }

  return (
    <div className="space-y-3.5 p-6">
      {/* Metrics row */}
      <DashboardStatsRow stats={data.stats} />

      {/* 2-col grid: Instance Health | Provider Chart */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <DashboardInstanceHealth instances={data.instanceHealth} />
        <DashboardProviderChart data={data.providerDistribution} />
      </div>

      {/* Full-width: Recent Activity */}
      <DashboardRecentActivity activities={data.recentActivity} />
    </div>
  )
}
