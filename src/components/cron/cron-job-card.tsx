"use client"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Clock,
  Timer,
  CalendarClock,
  Play,
  Pause,
  Bot,
  Trash2,
  Power,
  PowerOff,
  Zap,
  MessageSquare,
  CheckCircle2,
  XCircle,
  SkipForward,
} from "lucide-react"
import { useT } from "@/stores/language-store"
import type { CronJob } from "@/types/cron"

// ─── Human-readable schedule ────────────────────────────────────────

/**
 * Parse a standard 5-field cron expression into human-readable text.
 * Handles common patterns like "0 8 * * *" → "Daily 08:00"
 */
function humanizeCronExpr(expr: string, t: ReturnType<typeof useT>): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length < 5) return expr

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const pad = (n: string) => n.padStart(2, "0")

  const weekdayNames: Record<string, string> = {
    "0": t("cron.weekSun"),
    "1": t("cron.weekMon"),
    "2": t("cron.weekTue"),
    "3": t("cron.weekWed"),
    "4": t("cron.weekThu"),
    "5": t("cron.weekFri"),
    "6": t("cron.weekSat"),
    "7": t("cron.weekSun"),
  }

  const isWild = (s: string) => s === "*"
  const isNumber = (s: string) => /^\d+$/.test(s)

  // Every N minutes: */N * * * *
  if (minute.startsWith("*/") && isWild(hour) && isWild(dayOfMonth) && isWild(month) && isWild(dayOfWeek)) {
    const n = minute.slice(2)
    return t("cron.everyNMinutes").replace("{n}", n)
  }

  // Every N hours: 0 */N * * *
  if (isNumber(minute) && hour.startsWith("*/") && isWild(dayOfMonth) && isWild(month) && isWild(dayOfWeek)) {
    const n = hour.slice(2)
    return t("cron.everyNHours").replace("{n}", n)
  }

  // Daily: M H * * *
  if (isNumber(minute) && isNumber(hour) && isWild(dayOfMonth) && isWild(month) && isWild(dayOfWeek)) {
    return t("cron.everyDay").replace("{time}", `${pad(hour)}:${pad(minute)}`)
  }

  // Weekly: M H * * DOW
  if (isNumber(minute) && isNumber(hour) && isWild(dayOfMonth) && isWild(month) && isNumber(dayOfWeek)) {
    const dayName = weekdayNames[dayOfWeek] ?? dayOfWeek
    return t("cron.everyWeek").replace("{day}", dayName).replace("{time}", `${pad(hour)}:${pad(minute)}`)
  }

  // Monthly: M H DOM * *
  if (isNumber(minute) && isNumber(hour) && isNumber(dayOfMonth) && isWild(month) && isWild(dayOfWeek)) {
    return t("cron.everyMonth").replace("{day}", dayOfMonth).replace("{time}", `${pad(hour)}:${pad(minute)}`)
  }

  // Comma-separated weekdays: M H * * 1,3,5
  if (isNumber(minute) && isNumber(hour) && isWild(dayOfMonth) && isWild(month) && /^[\d,]+$/.test(dayOfWeek)) {
    const days = dayOfWeek.split(",").map((d) => weekdayNames[d] ?? d).join("、")
    return t("cron.everyWeekdays").replace("{days}", days).replace("{time}", `${pad(hour)}:${pad(minute)}`)
  }

  // Fallback — return raw expression
  return expr
}

function humanizeSchedule(schedule: CronJob["schedule"], t: ReturnType<typeof useT>): string {
  switch (schedule.kind) {
    case "at":
      return schedule.at
        ? `${t("cron.scheduleAt")}: ${new Date(schedule.at).toLocaleString()}`
        : t("cron.scheduleAt")
    case "every": {
      if (!schedule.everyMs) return t("cron.scheduleEvery")
      const totalSecs = Math.round(schedule.everyMs / 1000)
      if (totalSecs < 60) return t("cron.everyNSeconds").replace("{n}", String(totalSecs))
      const mins = Math.round(totalSecs / 60)
      if (mins < 60) return t("cron.everyNMinutes").replace("{n}", String(mins))
      const hrs = Math.round(mins / 60)
      if (hrs < 24) return t("cron.everyNHours").replace("{n}", String(hrs))
      const days = Math.round(hrs / 24)
      return t("cron.everyNDays").replace("{n}", String(days))
    }
    case "cron":
      return schedule.expr ? humanizeCronExpr(schedule.expr, t) : t("cron.scheduleCron")
    default:
      return String(schedule.kind)
  }
}

const SCHEDULE_ICON = {
  at: CalendarClock,
  every: Timer,
  cron: Clock,
} as const

const LAST_RUN_STATUS_ICON = {
  success: { icon: CheckCircle2, className: "text-emerald-500" },
  error: { icon: XCircle, className: "text-red-500" },
  skipped: { icon: SkipForward, className: "text-amber-500" },
} as const

// ─── Component ──────────────────────────────────────────────────────

interface CronJobCardProps {
  job: CronJob & { _instanceId?: string }
  isSelected: boolean
  onClick: () => void
  onToggle?: (enabled: boolean) => void
  onRun?: () => void
  onDelete?: () => void
}

export function CronJobCard({
  job,
  isSelected,
  onClick,
  onToggle,
  onRun,
  onDelete,
}: CronJobCardProps) {
  const t = useT()
  const ScheduleIcon = SCHEDULE_ICON[job.schedule.kind] ?? Clock

  // Payload preview text
  const payloadPreview =
    job.payload.kind === "systemEvent"
      ? job.payload.text
      : job.payload.message
  const truncatedPayload = payloadPreview
    ? payloadPreview.length > 40
      ? payloadPreview.slice(0, 40) + "…"
      : payloadPreview
    : null

  // Last run status
  const lastRunCfg = job.lastRunStatus
    ? LAST_RUN_STATUS_ICON[job.lastRunStatus as keyof typeof LAST_RUN_STATUS_ICON]
    : null
  const LastRunIcon = lastRunCfg?.icon

  return (
    <div
      className={`rounded-xl border bg-card p-4 transition-all cursor-pointer ${
        isSelected
          ? "ring-2 ring-primary/40 border-primary/30"
          : "hover:border-muted-foreground/20 hover:shadow-sm"
      }`}
      onClick={onClick}
    >
      {/* Row 1: schedule icon + name + enabled badge */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
            job.enabled ? "bg-primary/10" : "bg-muted"
          }`}>
            <ScheduleIcon className={`size-3.5 ${job.enabled ? "text-primary" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{job.name}</p>
            {job.agentId && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                <Bot className="size-2.5 shrink-0" />
                <span className="truncate">{job.agentId}</span>
              </div>
            )}
          </div>
        </div>
        <Badge
          variant={job.enabled ? "default" : "secondary"}
          className="gap-1 px-2 py-0.5 text-[11px] shrink-0"
        >
          {job.enabled ? (
            <>
              <Play className="size-2.5" />
              {t("cron.enabled")}
            </>
          ) : (
            <>
              <Pause className="size-2.5" />
              {t("cron.paused")}
            </>
          )}
        </Badge>
      </div>

      {/* Row 2: human-readable schedule */}
      <div className="mt-2.5 flex items-center gap-1.5 text-[12px]">
        <ScheduleIcon className="size-3 text-muted-foreground shrink-0" />
        <span className="text-foreground/80 font-medium">
          {humanizeSchedule(job.schedule, t)}
        </span>
        {job.schedule.tz && (
          <span className="text-muted-foreground/60 text-[11px]">({job.schedule.tz})</span>
        )}
      </div>

      {/* Row 3: session target + payload preview */}
      <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Zap className="size-2.5" />
            {job.sessionTarget === "main" ? t("cron.sessionMain") : t("cron.sessionIsolated")}
          </span>
          {job.deleteAfterRun && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600 border-amber-500/30 dark:text-amber-400">
              {t("cron.deleteAfterRun")}
            </Badge>
          )}
        </div>
        {truncatedPayload && (
          <div className="flex items-start gap-1">
            <MessageSquare className="size-2.5 mt-0.5 shrink-0" />
            <span className="text-foreground/60 line-clamp-1">{truncatedPayload}</span>
          </div>
        )}
      </div>

      {/* Row 4: next run + last run status */}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        {job.nextRunAt && (
          <span className="flex items-center gap-1">
            <CalendarClock className="size-2.5" />
            {t("cron.nextRun")}: {new Date(job.nextRunAt).toLocaleString()}
          </span>
        )}
        {LastRunIcon && (
          <span className="flex items-center gap-1">
            <LastRunIcon className={`size-2.5 ${lastRunCfg.className}`} />
            {t("cron.lastRun")}
          </span>
        )}
      </div>

      {/* Row 5: action buttons — styled */}
      <div className="mt-3 flex items-center gap-1.5 border-t border-border/50 pt-3">
        {onToggle && (
          <Button
            variant={job.enabled ? "outline" : "default"}
            size="sm"
            className="h-7 gap-1 px-2.5 text-[11px]"
            onClick={(e) => {
              e.stopPropagation()
              onToggle(!job.enabled)
            }}
          >
            {job.enabled ? (
              <>
                <PowerOff className="size-3" />
                {t("cron.paused")}
              </>
            ) : (
              <>
                <Power className="size-3" />
                {t("cron.enabled")}
              </>
            )}
          </Button>
        )}
        {onRun && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2.5 text-[11px]"
            onClick={(e) => {
              e.stopPropagation()
              onRun()
            }}
          >
            <Play className="size-3" />
            {t("cron.actionRun")}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
