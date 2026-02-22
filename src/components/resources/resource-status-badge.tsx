"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle2, AlertCircle, HelpCircle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"
import type { ResourceStatus } from "@/types/resource"

const statusConfig: Record<
  ResourceStatus,
  { labelKey: TranslationKey; icon: typeof CheckCircle2; className: string }
> = {
  ACTIVE: {
    labelKey: "resource.statusActive",
    icon: CheckCircle2,
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  UNTESTED: {
    labelKey: "resource.statusUntested",
    icon: HelpCircle,
    className: "bg-slate-100 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400",
  },
  ERROR: {
    labelKey: "resource.statusError",
    icon: AlertCircle,
    className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
}

export function ResourceStatusBadge({ status }: { status: ResourceStatus }) {
  const t = useT()
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <Badge variant="secondary" className={`gap-1 px-2 py-0 text-[11px] font-medium border-0 ${config.className}`}>
      <Icon className="size-3" />
      {t(config.labelKey)}
    </Badge>
  )
}
