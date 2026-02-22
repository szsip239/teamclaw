"use client"

import { Badge } from "@/components/ui/badge"
import { Database, Cloud } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { SkillSource } from "@/types/skill"
import type { TranslationKey } from "@/locales/zh-CN"

const SOURCE_CONFIG = {
  LOCAL: { labelKey: 'skill.sourceLocal' as TranslationKey, icon: Database, className: "text-slate-600 border-slate-500/20 dark:text-slate-400" },
  CLAWHUB: { labelKey: null, icon: Cloud, className: "text-cyan-600 border-cyan-500/20 dark:text-cyan-400" },
} as const

export function SkillSourceBadge({ source }: { source: SkillSource }) {
  const t = useT()
  const cfg = SOURCE_CONFIG[source]
  return (
    <Badge
      variant="outline"
      className={`gap-1 px-2 py-0.5 text-[11px] font-normal ${cfg.className}`}
    >
      <cfg.icon className="size-2.5" />
      {cfg.labelKey ? t(cfg.labelKey) : 'ClawHub'}
    </Badge>
  )
}
