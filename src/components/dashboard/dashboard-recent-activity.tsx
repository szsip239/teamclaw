"use client"

import {
  LogIn,
  KeyRound,
  Server,
  UserPlus,
  Bot,
  XCircle,
  Shield,
  Puzzle,
  Settings,
  type LucideIcon,
} from "lucide-react"
import { useT } from "@/stores/language-store"
import type { RecentActivity } from "@/types/dashboard"
import type { TranslationKey } from "@/locales/zh-CN"

interface RecentActivityProps {
  activities: RecentActivity[]
}

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string

// Map action prefixes to icon + color
const ACTION_ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  LOGIN: { icon: LogIn, cls: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" },
  LOGOUT: { icon: LogIn, cls: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" },
  AUTH: { icon: LogIn, cls: "bg-indigo-500/10 text-indigo-500 dark:text-indigo-400" },
  RESOURCE: { icon: KeyRound, cls: "bg-emerald-400/10 text-emerald-600 dark:text-emerald-400" },
  INSTANCE: { icon: Server, cls: "bg-cyan-400/10 text-cyan-600 dark:text-cyan-400" },
  USER: { icon: UserPlus, cls: "bg-violet-400/10 text-violet-600 dark:text-violet-400" },
  AGENT: { icon: Bot, cls: "bg-amber-400/10 text-amber-600 dark:text-amber-400" },
  SKILL: { icon: Puzzle, cls: "bg-amber-400/10 text-amber-600 dark:text-amber-400" },
  CONFIG: { icon: Settings, cls: "bg-cyan-400/10 text-cyan-600 dark:text-cyan-400" },
  DENIED: { icon: Shield, cls: "bg-red-400/10 text-red-500 dark:text-red-400" },
}

function getActionIcon(action: string, result: string) {
  if (result === "FAILURE" || result === "DENIED") {
    return { icon: XCircle, cls: "bg-red-400/10 text-red-500 dark:text-red-400" }
  }
  const prefix = action.split("_")[0]
  return ACTION_ICONS[prefix] ?? { icon: Shield, cls: "bg-muted text-muted-foreground" }
}

// Action → translation key mapping
const ACTION_LABEL_KEYS: Record<string, TranslationKey> = {
  LOGIN: "dashboard.action.LOGIN",
  LOGOUT: "dashboard.action.LOGOUT",
  AUTH_REFRESH: "dashboard.action.AUTH_REFRESH",
  INSTANCE_CREATE: "dashboard.action.INSTANCE_CREATE",
  INSTANCE_UPDATE: "dashboard.action.INSTANCE_UPDATE",
  INSTANCE_DELETE: "dashboard.action.INSTANCE_DELETE",
  INSTANCE_START: "dashboard.action.INSTANCE_START",
  INSTANCE_STOP: "dashboard.action.INSTANCE_STOP",
  INSTANCE_RESTART: "dashboard.action.INSTANCE_RESTART",
  INSTANCE_CONFIG_PATCH: "dashboard.action.INSTANCE_CONFIG_PATCH",
  INSTANCE_DASHBOARD: "dashboard.action.INSTANCE_DASHBOARD",
  USER_CREATE: "dashboard.action.USER_CREATE",
  USER_UPDATE: "dashboard.action.USER_UPDATE",
  USER_DELETE: "dashboard.action.USER_DELETE",
  RESOURCE_CREATE: "dashboard.action.RESOURCE_CREATE",
  RESOURCE_UPDATE: "dashboard.action.RESOURCE_UPDATE",
  RESOURCE_DELETE: "dashboard.action.RESOURCE_DELETE",
  RESOURCE_TEST: "dashboard.action.RESOURCE_TEST",
  AGENT_CLASSIFY: "dashboard.action.AGENT_CLASSIFY",
  SKILL_CREATE: "dashboard.action.SKILL_CREATE",
  SKILL_UPDATE: "dashboard.action.SKILL_UPDATE",
  SKILL_DELETE: "dashboard.action.SKILL_DELETE",
  SKILL_INSTALL: "dashboard.action.SKILL_INSTALL",
}

function getActionLabel(action: string, t: TFn): string {
  const key = ACTION_LABEL_KEYS[action]
  return key ? t(key) : action.toLowerCase().replace(/_/g, " ")
}

// Resource type → translation key
const RESOURCE_LABEL_KEYS: Record<string, TranslationKey> = {
  instance: "dashboard.resource.instance",
  user: "dashboard.resource.user",
  resource: "dashboard.resource.resource",
  agent: "dashboard.resource.agent",
  skill: "dashboard.resource.skill",
  auth: "dashboard.resource.auth",
  config: "dashboard.resource.config",
  department: "dashboard.resource.department",
}

function timeAgo(iso: string, t: TFn): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return t('time.justNow')
  if (min < 60) return t('time.minutesAgo', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return t('time.hoursAgo', { n: hr })
  return t('time.daysAgo', { n: Math.floor(hr / 24) })
}

export function DashboardRecentActivity({ activities }: RecentActivityProps) {
  const t = useT()

  return (
    <div className="bg-card rounded-[10px] border p-5 opacity-0 animate-[cardIn_0.5s_ease_0.42s_forwards]">
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
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {t('dashboard.recentActivity')}
        </span>
        <span className="bg-muted rounded px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
          {t('dashboard.realtime')}
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('dashboard.noActivity')}</p>
      ) : (
        <div className="flex flex-col">
          {activities.map((act) => {
            const { icon: Icon, cls } = getActionIcon(act.action, act.result)
            const resourceLabelKey = RESOURCE_LABEL_KEYS[act.resource]
            const resourceLabel = resourceLabelKey ? t(resourceLabelKey) : act.resource
            return (
              <div
                key={act.id}
                className="flex items-start gap-2.5 border-b border-border/50 py-[7px] last:border-b-0"
              >
                {/* Icon */}
                <div
                  className={`mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-[5px] ${cls}`}
                >
                  <Icon className="size-[11px]" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="text-[11.5px] leading-[1.4] text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                      {act.userName}
                    </strong>{" "}
                    {getActionLabel(act.action, t)}{" "}
                    {act.resourceId && (
                      <>
                        <span className="text-muted-foreground/60">·</span>{" "}
                        <span className="text-[10px] text-muted-foreground/70">
                          {resourceLabel}
                        </span>{" "}
                        <span className="font-mono text-[11px] text-primary/80">
                          {act.resourceId.length > 16
                            ? act.resourceId.slice(0, 16) + "..."
                            : act.resourceId}
                        </span>
                      </>
                    )}
                    {act.result !== "SUCCESS" && (
                      <span
                        className="ml-1 inline-block rounded-[3px] bg-red-400/10 px-[5px] py-px text-[9.5px] font-semibold text-red-500 dark:text-red-400"
                      >
                        {act.result === "FAILURE" ? t('dashboard.resultFailure') : t('dashboard.resultDenied')}
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
                    {timeAgo(act.createdAt, t)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
