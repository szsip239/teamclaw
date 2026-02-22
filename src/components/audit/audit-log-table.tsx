"use client"

import { useState, Fragment } from "react"
import {
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  LogIn,
  KeyRound,
  Server,
  UserPlus,
  Bot,
  Shield,
  Puzzle,
  type LucideIcon,
} from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/stores/language-store"
import type { AuditLogEntry } from "@/types/audit"

interface TableProps {
  logs: AuditLogEntry[]
  total: number
  page: number
  pageSize: number
  isLoading: boolean
  onPageChange: (page: number) => void
}

// ─── Action icons ────────────────────────────────────────────────────
const ACTION_ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  LOGIN: { icon: LogIn, cls: "bg-indigo-500/10 text-indigo-400" },
  LOGOUT: { icon: LogIn, cls: "bg-indigo-500/10 text-indigo-400" },
  AUTH: { icon: LogIn, cls: "bg-indigo-500/10 text-indigo-400" },
  PASSWORD: { icon: Shield, cls: "bg-indigo-500/10 text-indigo-400" },
  RESOURCE: { icon: KeyRound, cls: "bg-emerald-400/10 text-emerald-400" },
  INSTANCE: { icon: Server, cls: "bg-cyan-400/10 text-cyan-400" },
  USER: { icon: UserPlus, cls: "bg-violet-400/10 text-violet-400" },
  AGENT: { icon: Bot, cls: "bg-amber-400/10 text-amber-400" },
  SKILL: { icon: Puzzle, cls: "bg-amber-400/10 text-amber-400" },
}

function getActionIcon(action: string) {
  const prefix = action.split("_")[0]
  return ACTION_ICONS[prefix] ?? { icon: Shield, cls: "bg-zinc-500/10 text-zinc-400" }
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

// ─── JSON syntax highlighting ────────────────────────────────────────
function highlightJson(obj: Record<string, unknown>): React.ReactNode {
  const json = JSON.stringify(obj, null, 2)
  // Color keys, strings, numbers, booleans
  const parts = json.split(
    /("(?:[^"\\]|\\.)*")\s*(?=:)|("(?:[^"\\]|\\.)*")|(true|false|null)|(\d+(?:\.\d+)?)/g
  )
  return parts.map((part, i) => {
    if (part === undefined || part === "") return null
    if (/^".*":?$/.test(part) && json.indexOf(part + ":") !== -1) {
      // Check if this is a key (followed by colon in source)
      return <span key={i} className="text-cyan-400">{part}</span>
    }
    if (/^".*"$/.test(part)) {
      return <span key={i} className="text-emerald-400">{part}</span>
    }
    if (/^(true|false|null)$/.test(part)) {
      return <span key={i} className="text-violet-400">{part}</span>
    }
    if (/^\d/.test(part)) {
      return <span key={i} className="text-amber-400">{part}</span>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

// ─── Main component ──────────────────────────────────────────────────
export function AuditLogTable({
  logs,
  total,
  page,
  pageSize,
  isLoading,
  onPageChange,
}: TableProps) {
  const t = useT()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded" />
        ))}
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="text-muted-foreground flex h-40 items-center justify-center rounded-[10px] border text-sm">
        {t('audit.noData')}
      </div>
    )
  }

  // Build page numbers
  const pageNumbers = buildPageNumbers(page, totalPages)

  return (
    <div className="space-y-0">
      {/* Table */}
      <div className="overflow-hidden rounded-[10px] border opacity-0 animate-[cardIn_0.4s_ease_0.1s_forwards]">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="w-[30px] p-0" />
              <th className="text-muted-foreground whitespace-nowrap px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.time')}
              </th>
              <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.operator')}
              </th>
              <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.actionType')}
              </th>
              <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.resourceCol')}
              </th>
              <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.details')}
              </th>
              <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.ipAddress')}
              </th>
              <th className="text-muted-foreground px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider">
                {t('audit.result')}
              </th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const isExpanded = expandedId === log.id
              const hasDetails = log.details && Object.keys(log.details).length > 0
              const { icon: ActionIcon, cls: actionCls } = getActionIcon(log.action)

              return (
                <Fragment key={log.id}>
                  <tr
                    className={`cursor-pointer border-b transition-colors hover:bg-white/[0.02] ${isExpanded ? "bg-white/[0.02]" : ""}`}
                    onClick={hasDetails ? () => setExpandedId(isExpanded ? null : log.id) : undefined}
                  >
                    {/* Expand arrow */}
                    <td className="w-[30px] px-2 py-2.5">
                      {hasDetails && (
                        <ChevronRight
                          className={`text-muted-foreground size-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        />
                      )}
                    </td>

                    {/* Time */}
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[11px] text-zinc-500">
                      {formatTime(log.createdAt)}
                    </td>

                    {/* User */}
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-[7px]">
                        <div className="flex size-[22px] shrink-0 items-center justify-center rounded-[5px] bg-indigo-500/10 text-[10px] font-bold text-indigo-400">
                          {getInitials(log.userName)}
                        </div>
                        <span className="text-[12.5px] font-medium">
                          {log.userName}
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`flex size-[22px] shrink-0 items-center justify-center rounded-[5px] ${actionCls}`}
                        >
                          <ActionIcon className="size-3" />
                        </div>
                        <span className="text-xs font-medium">
                          {log.action.replace(/_/g, " ").toLowerCase()}
                        </span>
                      </div>
                    </td>

                    {/* Resource */}
                    <td className="px-3.5 py-2.5 font-mono text-[11.5px] text-cyan-400">
                      {log.resource}
                      {log.resourceId && (
                        <span className="text-zinc-600">
                          :{log.resourceId.slice(0, 8)}
                        </span>
                      )}
                    </td>

                    {/* Detail summary */}
                    <td className="max-w-[220px] truncate px-3.5 py-2.5 text-xs text-zinc-500">
                      {log.details
                        ? Object.entries(log.details)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")
                        : "—"}
                    </td>

                    {/* IP */}
                    <td className="px-3.5 py-2.5 font-mono text-[11px] text-zinc-500">
                      {log.ipAddress}
                    </td>

                    {/* Result */}
                    <td className="px-3.5 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                          log.result === "SUCCESS"
                            ? "bg-emerald-400/10 text-emerald-400"
                            : "bg-red-400/10 text-red-400"
                        }`}
                      >
                        {log.result === "SUCCESS" ? (
                          <Check className="size-[11px]" />
                        ) : (
                          <X className="size-[11px]" />
                        )}
                        {log.result === "SUCCESS" ? t('audit.resultSuccess') : t('audit.resultFailure')}
                      </span>
                    </td>
                  </tr>

                  {/* Expanded detail row */}
                  {isExpanded && hasDetails && (
                    <tr>
                      <td colSpan={8} className="border-b bg-indigo-500/[0.02] px-3.5 pb-3.5">
                        <div className="overflow-auto whitespace-pre rounded-md border bg-black/30 p-3 font-mono text-[11px] leading-[1.6] dark:bg-black/30">
                          {highlightJson(log.details!)}
                        </div>
                        {log.userAgent && (
                          <p className="mt-2 text-[11px] text-zinc-600">
                            UA: {log.userAgent}
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="bg-card flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-zinc-500">
            {t('audit.showing')}{" "}
            <strong className="font-mono text-zinc-400">
              {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, total)}
            </strong>
            {t('audit.totalRecords', { n: total })}
          </p>
          <div className="flex gap-1">
            <button
              className="flex size-[30px] items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="size-3.5" />
            </button>
            {pageNumbers.map((num, i) =>
              num === "..." ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex size-[30px] items-center justify-center font-mono text-xs text-zinc-600"
                >
                  &hellip;
                </span>
              ) : (
                <button
                  key={num}
                  className={`flex size-[30px] items-center justify-center rounded-md font-mono text-xs transition-colors ${
                    num === page
                      ? "bg-indigo-500 text-white"
                      : "text-zinc-500 hover:bg-white/5 hover:text-zinc-200"
                  }`}
                  onClick={() => onPageChange(num as number)}
                >
                  {num}
                </button>
              ),
            )}
            <button
              className="flex size-[30px] items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-200 disabled:opacity-30"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Pagination helper ───────────────────────────────────────────────
function buildPageNumbers(
  current: number,
  total: number,
): (number | "...")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: (number | "...")[] = [1]
  if (current > 3) pages.push("...")
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push("...")
  pages.push(total)
  return pages
}
