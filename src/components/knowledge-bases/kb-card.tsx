"use client"

import { motion } from "motion/react"
import { BookOpen, FileText, Building2, Shield, Link } from "lucide-react"
import { KbScopeBadge } from "./kb-scope-badge"
import { useT } from "@/stores/language-store"
import type { KnowledgeBaseOverview } from "@/types/knowledge-base"
import { Badge } from "@/components/ui/badge"
import type { KbCategory } from "@/types/knowledge-base"

const CATEGORY_CONFIG: Record<KbCategory, { labelKey: string; icon: typeof BookOpen; className: string }> = {
  INTERNAL: {
    labelKey: "kb.category.INTERNAL",
    icon: FileText,
    className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  },
  EXTERNAL: {
    labelKey: "kb.category.EXTERNAL",
    icon: Link,
    className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800",
  },
  RULES: {
    labelKey: "kb.category.RULES",
    icon: Shield,
    className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  },
}

interface KbCardProps {
  kb: KnowledgeBaseOverview
  index: number
  onClick: (kb: KnowledgeBaseOverview) => void
}

export function KbCard({ kb, index, onClick }: KbCardProps) {
  const t = useT()

  const timeAgo = formatTimeAgo(kb.updatedAt)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="group cursor-pointer rounded-xl border bg-card p-5 ring-1 ring-black/[0.03] transition-all hover:ring-primary/20 hover:shadow-sm dark:ring-white/[0.06] dark:hover:ring-primary/30"
      onClick={() => onClick(kb)}
    >
      {/* Header: Icon + Name + Badges */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-muted to-muted/60 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            <BookOpen className="size-5 text-muted-foreground/70" />
          </div>
          <div className="min-w-0">
            <span className="truncate text-sm font-semibold leading-tight block">
              {kb.name}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <KbCategoryBadge category={kb.category} />
          <KbScopeBadge scope={kb.scope} />
        </div>
      </div>

      {/* Description */}
      {kb.description && (
        <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
          {kb.description}
        </p>
      )}

      {/* Department (for DEPARTMENT scope) */}
      {kb.scope === "DEPARTMENT" && kb.departmentName && (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Building2 className="size-3 shrink-0" />
          <span className="truncate">{kb.departmentName}</span>
        </div>
      )}

      {/* Footer: doc count + time */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <FileText className="size-3" />
          <span>{t('kb.docCount', { n: kb.documentCount })}</span>
        </div>
        <span>{timeAgo}</span>
      </div>
    </motion.div>
  )
}

function KbCategoryBadge({ category }: { category: KbCategory }) {
  const t = useT()
  const cfg = CATEGORY_CONFIG[category]
  return (
    <Badge variant="outline" className={`text-[10px] font-medium gap-0.5 ${cfg.className}`}>
      <cfg.icon className="size-2.5" />
      {t(cfg.labelKey as Parameters<typeof t>[0])}
    </Badge>
  )
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString()
}
