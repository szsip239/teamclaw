"use client"

import { Badge } from "@/components/ui/badge"
import { Brain, Wrench } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"
import type { ResourceType } from "@/types/resource"

const typeConfig: Record<
  ResourceType,
  { labelKey: TranslationKey; icon: typeof Brain; className: string }
> = {
  MODEL: {
    labelKey: "resource.typeModel",
    icon: Brain,
    className: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  TOOL: {
    labelKey: "resource.typeTool",
    icon: Wrench,
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
}

export function ResourceTypeBadge({ type }: { type: ResourceType }) {
  const t = useT()
  const config = typeConfig[type]
  const Icon = config.icon

  return (
    <Badge variant="secondary" className={`gap-1 px-2 py-0 text-[11px] font-medium border-0 ${config.className}`}>
      <Icon className="size-3" />
      {t(config.labelKey)}
    </Badge>
  )
}
