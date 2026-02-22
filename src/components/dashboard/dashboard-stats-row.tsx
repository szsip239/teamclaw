"use client"

import { Server, MessageSquare, KeyRound, Bot, Puzzle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { DashboardStats } from "@/types/dashboard"
import type { TranslationKey } from "@/locales/zh-CN"

interface StatsRowProps {
  stats: DashboardStats
}

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

const statCards = [
  {
    key: "instances",
    labelKey: "dashboard.totalInstances" as TranslationKey,
    icon: Server,
    gradient: "from-indigo-500 to-transparent",
    iconBg: "bg-indigo-500/10 text-indigo-400",
    getValue: (s: DashboardStats) => String(s.totalInstances),
    getSubs: (s: DashboardStats, t: TFn) => [
      { dot: "bg-emerald-400", text: t('dashboard.onlineCount', { n: s.onlineInstances }) },
      { dot: "bg-zinc-500", text: t('dashboard.offlineCount', { n: s.totalInstances - s.onlineInstances }) },
    ],
  },
  {
    key: "sessions",
    labelKey: "dashboard.activeSessions" as TranslationKey,
    icon: MessageSquare,
    gradient: "from-cyan-400 to-transparent",
    iconBg: "bg-cyan-400/10 text-cyan-400",
    getValue: (s: DashboardStats) => String(s.totalSessions),
    getSubs: (s: DashboardStats, t: TFn) => [
      { dot: "bg-emerald-400", text: t('dashboard.totalSessions', { n: s.totalSessions }) },
    ],
  },
  {
    key: "resources",
    labelKey: "dashboard.resourceStatus" as TranslationKey,
    icon: KeyRound,
    gradient: "from-emerald-400 to-transparent",
    iconBg: "bg-emerald-400/10 text-emerald-400",
    getValue: (s: DashboardStats) => String(s.totalResources),
    getSubs: (_s: DashboardStats, t: TFn) => [
      { dot: "bg-emerald-400", text: t('dashboard.apiKeys') },
    ],
  },
  {
    key: "users",
    labelKey: "dashboard.totalUsers" as TranslationKey,
    icon: Bot,
    gradient: "from-violet-400 to-transparent",
    iconBg: "bg-violet-400/10 text-violet-400",
    getValue: (s: DashboardStats) => String(s.totalUsers),
    getSubs: (s: DashboardStats, t: TFn) => [
      { dot: "bg-indigo-400", text: t('dashboard.activeUsers', { n: s.activeUsers }) },
    ],
  },
  {
    key: "skills",
    labelKey: "dashboard.skillsStats" as TranslationKey,
    icon: Puzzle,
    gradient: "from-amber-400 to-transparent",
    iconBg: "bg-amber-400/10 text-amber-400",
    getValue: (s: DashboardStats) => String(s.totalSkills),
    getSubs: (_s: DashboardStats, t: TFn) => [
      { dot: "bg-emerald-400", text: t('dashboard.created') },
    ],
  },
]

export function DashboardStatsRow({ stats }: StatsRowProps) {
  const t = useT()
  return (
    <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
      {statCards.map((card, i) => (
        <div
          key={card.key}
          className="bg-card relative overflow-hidden rounded-[10px] border p-5 opacity-0 animate-[cardIn_0.5s_ease_forwards] transition-all hover:-translate-y-0.5 hover:shadow-sm dark:hover:border-white/10"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {/* Gradient top line */}
          <div
            className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r ${card.gradient}`}
          />

          {/* Icon */}
          <div
            className={`mb-3.5 flex size-8 items-center justify-center rounded-lg ${card.iconBg}`}
          >
            <card.icon className="size-4" />
          </div>

          {/* Label */}
          <p className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide">
            {t(card.labelKey)}
          </p>

          {/* Value */}
          <p className="mb-2.5 font-mono text-[28px] font-bold leading-none tracking-tight">
            {card.getValue(stats)}
          </p>

          {/* Sub stats */}
          <div className="flex gap-2.5">
            {card.getSubs(stats, t).map((sub, j) => (
              <span
                key={j}
                className="text-muted-foreground flex items-center gap-1 text-[11px]"
              >
                <span
                  className={`inline-block size-1.5 rounded-full ${sub.dot}`}
                />
                {sub.text}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
