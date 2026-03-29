"use client"

import { useRouter } from "next/navigation"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { KbScopeBadge } from "./kb-scope-badge"
import { useT } from "@/stores/language-store"
import type { KnowledgeBaseDetail } from "@/types/knowledge-base"

interface KbDetailHeaderProps {
  kb: KnowledgeBaseDetail
  canManage: boolean
  onDelete: () => void
}

export function KbDetailHeader({ kb, canManage, onDelete }: KbDetailHeaderProps) {
  const router = useRouter()
  const t = useT()

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
