"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useT } from "@/stores/language-store"

const STATUS_CONFIG = {
  ONLINE: {
    labelKey: "instance.statusRunning" as const,
    dot: "bg-emerald-500",
    badge: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25",
    pulse: true,
  },
  OFFLINE: {
    labelKey: "instance.statusStopped" as const,
    dot: "bg-zinc-400 dark:bg-zinc-500",
    badge: "bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700",
    pulse: false,
  },
  DEGRADED: {
    labelKey: "instance.statusDegraded" as const,
    dot: "bg-amber-500",
    badge: "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/25",
    pulse: true,
  },
  ERROR: {
    labelKey: "instance.statusError" as const,
    dot: "bg-red-500",
    badge: "bg-red-500/10 text-red-600 border-red-500/20 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/25",
    pulse: false,
  },
  STARTING: {
    labelKey: "instance.statusStarting" as const,
    dot: "bg-sky-500",
    badge: "bg-sky-500/10 text-sky-600 border-sky-500/20 dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/25",
    pulse: true,
  },
  STOPPING: {
    labelKey: "instance.statusStopping" as const,
    dot: "bg-orange-500",
    badge: "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/25",
    pulse: true,
  },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

interface InstanceStatusBadgeProps {
  status: string
  className?: string
}

export function InstanceStatusBadge({ status, className }: InstanceStatusBadgeProps) {
  const t = useT()
  const config = STATUS_CONFIG[status as StatusKey] || STATUS_CONFIG.OFFLINE

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 px-2.5 py-0.5 text-xs font-medium",
        config.badge,
        className,
      )}
    >
      <span className="relative flex size-2">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              config.dot,
            )}
          />
        )}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            config.dot,
          )}
        />
      </span>
      {t(config.labelKey)}
    </Badge>
  )
}
