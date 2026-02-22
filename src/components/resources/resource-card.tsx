"use client"

import { motion } from "motion/react"
import { KeyRound, Clock } from "lucide-react"
import { ResourceTypeBadge } from "./resource-type-badge"
import { ResourceStatusBadge } from "./resource-status-badge"
import { useT } from "@/stores/language-store"
import type { ResourceOverview } from "@/types/resource"

interface ResourceCardProps {
  resource: ResourceOverview
  index: number
  onClick: (resource: ResourceOverview) => void
}

function formatRelativeTime(dateStr: string, t: ReturnType<typeof useT>): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return t('time.justNow')
  if (minutes < 60) return t('time.minutesAgo', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('time.hoursAgo', { n: hours })
  const days = Math.floor(hours / 24)
  return t('time.daysAgo', { n: days })
}

export function ResourceCard({ resource, index, onClick }: ResourceCardProps) {
  const t = useT()
  const providerName = resource.providerName || resource.provider
  const timeAgo = resource.lastTestedAt
    ? formatRelativeTime(resource.lastTestedAt, t)
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="group cursor-pointer rounded-xl border bg-card p-5 ring-1 ring-black/[0.03] transition-all hover:ring-primary/20 hover:shadow-sm dark:ring-white/[0.06] dark:hover:ring-primary/30"
      onClick={() => onClick(resource)}
    >
      {/* Header: Name + Badges */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/60 text-sm font-bold uppercase ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            {resource.provider.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <span className="truncate text-sm font-semibold leading-tight">
              {resource.name}
            </span>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {providerName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <ResourceTypeBadge type={resource.type} />
          <ResourceStatusBadge status={resource.status} />
        </div>
      </div>

      {/* Description */}
      {resource.description && (
        <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {resource.description}
        </p>
      )}

      {/* Footer: Masked Key + Last Tested */}
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
          <KeyRound className="size-3 shrink-0" />
          <span className="truncate">{resource.maskedKey}</span>
        </div>
        {timeAgo && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="size-3" />
            <span>{timeAgo}</span>
          </div>
        )}
      </div>

      {/* Default badge */}
      {resource.isDefault && (
        <div className="mt-2">
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {t('resource.isDefault')}
          </span>
        </div>
      )}
    </motion.div>
  )
}
