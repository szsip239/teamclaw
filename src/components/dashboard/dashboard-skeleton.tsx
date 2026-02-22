"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSkeleton() {
  return (
    <div className="space-y-3.5">
      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-card rounded-[10px] border p-5">
            <Skeleton className="mb-3.5 size-8 rounded-lg" />
            <Skeleton className="mb-1.5 h-3 w-16" />
            <Skeleton className="mb-2.5 h-7 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* 2-col grid: Instance Health | Provider Chart */}
      <div className="grid gap-3.5 lg:grid-cols-2">
        {/* Instance health */}
        <div className="bg-card rounded-[10px] border p-5">
          <Skeleton className="mb-4 h-4 w-24" />
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-[60px] rounded-lg" />
            ))}
          </div>
        </div>

        {/* Provider chart */}
        <div className="bg-card rounded-[10px] border p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-[22px] flex-1 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Full-width: Recent Activity */}
      <div className="bg-card rounded-[10px] border p-5">
        <Skeleton className="mb-4 h-4 w-24" />
        <div className="space-y-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2.5 border-b py-2 last:border-b-0">
              <Skeleton className="size-[22px] rounded-[5px]" />
              <div className="flex-1">
                <Skeleton className="mb-1 h-3 w-3/4" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
