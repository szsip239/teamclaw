"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function ConfigEditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar skeleton */}
      <div className="flex h-12 items-center justify-between border-b px-4">
        <Skeleton className="h-4 w-64" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Three-column skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* Module nav */}
        <div className="w-[220px] shrink-0 border-r p-3 space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </div>

        {/* Form panel */}
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>

        {/* JSON panel */}
        <div className="w-[400px] shrink-0 border-l p-3">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      </div>
    </div>
  )
}
