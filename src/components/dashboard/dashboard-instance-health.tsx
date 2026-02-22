"use client"

import { Bot, MessageSquare } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { InstanceHealthCard } from "@/types/dashboard"
import type { TranslationKey } from "@/locales/zh-CN"

interface InstanceHealthProps {
  instances: InstanceHealthCard[]
}

const statusDot: Record<string, string> = {
  ONLINE: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]",
  OFFLINE: "bg-zinc-400 dark:bg-zinc-500",
  DEGRADED: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]",
  ERROR: "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.4)]",
}

const statusLabelKey: Record<string, TranslationKey> = {
  ONLINE: "dashboard.statusOnline",
  OFFLINE: "dashboard.statusOffline",
  DEGRADED: "dashboard.statusDegraded",
  ERROR: "dashboard.statusError",
}

export function DashboardInstanceHealth({ instances }: InstanceHealthProps) {
  const t = useT()

  if (instances.length === 0) {
    return (
      <div className="bg-card rounded-[10px] border p-5">
        <div className="text-muted-foreground mb-4 flex items-center gap-1.5 text-[13px] font-semibold">
          {t('dashboard.instanceHealth')}
        </div>
        <p className="text-muted-foreground text-sm">{t('dashboard.noInstanceData')}</p>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-[10px] border p-5 opacity-0 animate-[cardIn_0.5s_ease_0.3s_forwards]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-semibold">
          <svg
            className="text-muted-foreground size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="2" width="20" height="8" rx="2" />
            <rect x="2" y="14" width="20" height="8" rx="2" />
            <circle cx="6" cy="6" r="1" />
            <circle cx="6" cy="18" r="1" />
          </svg>
          {t('dashboard.instanceHealth')}
        </span>
        <span className="bg-muted rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {t('dashboard.last60s')}
        </span>
      </div>

      {/* Grid */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {instances.map((inst) => (
          <div
            key={inst.id}
            className="cursor-pointer rounded-lg border bg-muted/40 p-3.5 transition-colors hover:bg-muted/70 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="truncate text-[12.5px] font-semibold text-foreground">
                {inst.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground">
                  {statusLabelKey[inst.status] ? t(statusLabelKey[inst.status]) : inst.status}
                </span>
                <span
                  className={`size-[7px] rounded-full ${statusDot[inst.status] ?? statusDot.OFFLINE}`}
                />
              </div>
            </div>
            {inst.version && (
              <p className="mb-2 font-mono text-[10px] text-muted-foreground/70">
                v{inst.version}
              </p>
            )}
            <div className="text-muted-foreground flex gap-3 text-[11px]">
              <span className="flex items-center gap-1">
                <Bot className="size-[11px] opacity-60" />
                <strong className="font-mono text-[11px] font-semibold text-foreground/70">
                  {inst.agentCount}
                </strong>{" "}
                agents
              </span>
              <span className="flex items-center gap-1">
                <MessageSquare className="size-[11px] opacity-60" />
                <strong className="font-mono text-[11px] font-semibold text-foreground/70">
                  {inst.sessionCount}
                </strong>{" "}
                {t('dashboard.sessions')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
