"use client"

import { Badge } from "@/components/ui/badge"
import { Globe, Building2, UserCircle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { SkillCategory } from "@/types/skill"
import type { TranslationKey } from "@/locales/zh-CN"

export const SKILL_CATEGORY_CONFIG = {
  DEFAULT: { labelKey: 'agent.categoryDefault' as TranslationKey, icon: Globe, className: "text-blue-600 border-blue-500/20 dark:text-blue-400" },
  DEPARTMENT: { labelKey: 'agent.categoryDepartment' as TranslationKey, icon: Building2, className: "text-emerald-600 border-emerald-500/20 dark:text-emerald-400" },
  PERSONAL: { labelKey: 'agent.categoryPersonal' as TranslationKey, icon: UserCircle, className: "text-violet-600 border-violet-500/20 dark:text-violet-400" },
} as const

export function SkillCategoryBadge({ category }: { category: SkillCategory }) {
  const t = useT()
  const cfg = SKILL_CATEGORY_CONFIG[category]
  return (
    <Badge
      variant="outline"
      className={`gap-1 px-2 py-0.5 text-[11px] font-normal ${cfg.className}`}
    >
      <cfg.icon className="size-2.5" />
      {t(cfg.labelKey)}
    </Badge>
  )
}
