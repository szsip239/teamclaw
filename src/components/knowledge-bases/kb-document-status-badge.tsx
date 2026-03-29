"use client"

import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react"
import { useT } from "@/stores/language-store"
import type { DocumentStatus } from "@/types/knowledge-base"

const STATUS_CONFIG: Record<DocumentStatus, {
  labelKey: string
  icon: typeof CheckCircle2
  className: string
}> = {
  PENDING: {
    labelKey: "kb.docPending",
    icon: Clock,
    className: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700",
  },
  PROCESSING: {
    labelKey: "kb.docProcessing",
    icon: Loader2,
    className: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
  },
  SUCCEEDED: {
    labelKey: "kb.docSucceeded",
    icon: CheckCircle2,
    className: "bg-green-50 text-green-600 border-green-200 dark:bg-green-950 dark:text-green-400 dark:border-green-800",
  },
  FAILED: {
    labelKey: "kb.docFailed",
    icon: XCircle,
    className: "bg-red-50 text-red-600 border-red-200 dark:bg-red-950 dark:text-red-400 dark:border-red-800",
  },
}

export function KbDocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const t = useT()
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon

  return (
    <Badge variant="outline" className={`gap-1 text-[10px] font-medium ${cfg.className}`}>
      <Icon className={`size-3 ${status === "PROCESSING" ? "animate-spin" : ""}`} />
      {t(cfg.labelKey as import("@/locales/zh-CN").TranslationKey)}
    </Badge>
  )
}
