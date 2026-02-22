"use client"

import { ResourceCard } from "./resource-card"
import { Skeleton } from "@/components/ui/skeleton"
import { KeyRound } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { ResourceOverview } from "@/types/resource"

interface ResourceCardGridProps {
  resources: ResourceOverview[]
  onSelect: (resource: ResourceOverview) => void
}

export function ResourceCardGrid({ resources, onSelect }: ResourceCardGridProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {resources.map((resource, i) => (
        <ResourceCard
          key={resource.id}
          resource={resource}
          index={i}
          onClick={onSelect}
        />
      ))}
    </div>
  )
}

export function ResourceCardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border bg-card p-5 ring-1 ring-black/[0.03] dark:ring-white/[0.06]"
        >
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-12 rounded-full" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
          <Skeleton className="mt-3 h-8 w-full" />
          <div className="mt-3 flex items-center justify-between">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ResourceEmptyState() {
  const t = useT()
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted">
        <KeyRound className="size-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{t('resource.noResources')}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {t('resource.noResourcesHint')}
      </p>
    </div>
  )
}
