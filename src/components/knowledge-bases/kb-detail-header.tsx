"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft, Pencil, Trash2, Shield, FileText, Link } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { KbScopeBadge } from "./kb-scope-badge"
import { useT } from "@/stores/language-store"
import type { KnowledgeBaseDetail, KbCategory } from "@/types/knowledge-base"

const CATEGORY_CONFIG: Record<KbCategory, { labelKey: string; icon: typeof FileText; className: string }> = {
  INTERNAL: { labelKey: "kb.category.INTERNAL", icon: FileText, className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800" },
  EXTERNAL: { labelKey: "kb.category.EXTERNAL", icon: Link, className: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800" },
  RULES: { labelKey: "kb.category.RULES", icon: Shield, className: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800" },
}

interface KbDetailHeaderProps {
  kb: KnowledgeBaseDetail
  canManage: boolean
  onDelete: () => void
}

export function KbDetailHeader({ kb, canManage, onDelete }: KbDetailHeaderProps) {
  const router = useRouter()
  const t = useT()
  const catCfg = CATEGORY_CONFIG[kb.category]

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push("/knowledge-bases")}
        >
          <ArrowLeft className="size-4" />
          {t('nav.knowledgeBases')}
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">{kb.name}</h1>
          <Badge variant="outline" className={`text-[10px] font-medium gap-1 ${catCfg.className}`}>
            <catCfg.icon className="size-2.5" />
            {t(catCfg.labelKey as Parameters<typeof t>[0])}
          </Badge>
          <KbScopeBadge scope={kb.scope} />
        </div>
      </div>
      {canManage && (
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            {t('delete')}
          </Button>
        </div>
      )}
    </div>
  )
}
