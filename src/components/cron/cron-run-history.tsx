"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CheckCircle2,
  XCircle,
  SkipForward,
  Loader2,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import { useT } from "@/stores/language-store"
import type { CronRun } from "@/types/cron"

// ─── Status Config ──────────────────────────────────────────────────

const STATUS_CONFIG = {
  success: {
    icon: CheckCircle2,
    labelKey: "cron.runSuccess" as const,
    className: "text-emerald-600 dark:text-emerald-400",
    badgeVariant: "default" as const,
  },
  error: {
    icon: XCircle,
    labelKey: "cron.runError" as const,
    className: "text-red-600 dark:text-red-400",
    badgeVariant: "destructive" as const,
  },
  skipped: {
    icon: SkipForward,
    labelKey: "cron.runSkipped" as const,
    className: "text-amber-600 dark:text-amber-400",
    badgeVariant: "secondary" as const,
  },
  running: {
    icon: Loader2,
    labelKey: "cron.runRunning" as const,
    className: "text-blue-600 dark:text-blue-400 animate-spin",
    badgeVariant: "outline" as const,
  },
} as const

function getStatusConfig(status: string) {
  return STATUS_CONFIG[status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.error
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.round(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainSecs = secs % 60
  return `${mins}m ${remainSecs}s`
}

// ─── Component ──────────────────────────────────────────────────────

interface CronRunHistoryProps {
  runs: CronRun[]
  isLoading: boolean
  selectedJobId: string | null
  statusFilter: string[]
}

export function CronRunHistory({
  runs,
  isLoading,
  selectedJobId,
  statusFilter,
}: CronRunHistoryProps) {
  const t = useT()
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  const filteredRuns =
    statusFilter.length === 0
      ? runs
      : runs.filter((r) => statusFilter.includes(r.status))

  if (filteredRuns.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Clock className="size-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">
          {selectedJobId ? t("cron.noRunsHint") : t("cron.noRuns")}
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t("cron.runStatus")}</th>
            <th className="px-3 py-2 font-medium">{t("name")}</th>
            <th className="px-3 py-2 font-medium">{t("cron.runStarted")}</th>
            <th className="px-3 py-2 font-medium">{t("cron.runDuration")}</th>
            <th className="px-3 py-2 font-medium">{t("cron.model")}</th>
            <th className="px-3 py-2 font-medium">{t("cron.runTokens")}</th>
            <th className="px-3 py-2 font-medium">{t("cron.runSummary")}</th>
          </tr>
        </thead>
        <tbody>
          {filteredRuns.map((run) => {
            const config = getStatusConfig(run.status)
            const StatusIcon = config.icon
            const isExpanded = expandedRunId === run.runId

            return (
              <tr
                key={run.runId}
                className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => setExpandedRunId(isExpanded ? null : run.runId)}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={`size-3.5 shrink-0 ${config.className}`} />
                    <Badge variant={config.badgeVariant} className="text-[10px] px-1.5 py-0">
                      {t(config.labelKey)}
                    </Badge>
                  </div>
                </td>
                <td className="px-3 py-2 max-w-[120px] truncate text-muted-foreground">
                  {run.jobName ?? "-"}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                  {new Date(run.startedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">
                  {run.durationMs != null ? formatDuration(run.durationMs) : "-"}
                </td>
                <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate">
                  {run.model ? run.model.split("/").pop() : "-"}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                  {run.tokens && (run.tokens.input || run.tokens.output)
                    ? `${run.tokens.input ?? 0}↑ ${run.tokens.output ?? 0}↓`
                    : "-"}
                </td>
                <td className="px-3 py-2 max-w-[200px]">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-foreground/80">
                      {run.summary ?? (run.error ? run.error.slice(0, 60) : "-")}
                    </span>
                    {(run.error || run.summary) && (
                      isExpanded
                        ? <ChevronUp className="size-3 shrink-0 text-muted-foreground" />
                        : <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  {isExpanded && (run.error || run.summary) && (
                    <div className="mt-1.5 text-[11px] leading-relaxed">
                      {run.error && (
                        <p className="text-red-600 dark:text-red-400 break-all">{run.error}</p>
                      )}
                      {run.summary && (
                        <p className="text-foreground/80 break-all">{run.summary}</p>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
