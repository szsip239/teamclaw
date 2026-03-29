"use client"

import { Badge } from "@/components/ui/badge"
import { useT } from "@/stores/language-store"
import type { KbScope } from "@/types/knowledge-base"

const SCOPE_CONFIG: Record<KbScope, { labelKey: string; className: string }> = {
  GLOBAL: {
    labelKey: "kb.scopeGlobal",
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  DEPARTMENT: {
    labelKey: "kb.scopeDepartment",
    className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  },
  PERSONAL: {
    labelKey: "kb.scopePersonal",
    className: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800",
  },
}

export function KbScopeBadge({ scope }: { scope: KbScope }) {
  const t = useT()
  const cfg = SCOPE_CONFIG[scope]

  return (
    <Badge variant="outline" className={`text-[10px] font-medium ${cfg.className}`}>
      {t(cfg.labelKey as import("@/locales/zh-CN").TranslationKey)}
    </Badge>
  )
}
