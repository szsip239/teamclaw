"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { KbScopeBadge } from "./kb-scope-badge"
import { useUpdateKb } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"
import type { KnowledgeBaseDetail } from "@/types/knowledge-base"

interface KbSettingsTabProps {
  kb: KnowledgeBaseDetail
  canManage: boolean
  onDelete: () => void
}

export function KbSettingsTab({ kb, canManage, onDelete }: KbSettingsTabProps) {
  const t = useT()
  const [name, setName] = useState(kb.name)
  const [description, setDescription] = useState(kb.description ?? "")
  const updateKb = useUpdateKb(kb.id)

  const isDirty = name !== kb.name || description !== (kb.description ?? "")

  async function handleSave() {
    try {
      await updateKb.mutateAsync({
        name: name !== kb.name ? name : undefined,
        description: description !== (kb.description ?? "") ? description : undefined,
      })
      toast.success(t('kb.settingsSaved'))
    } catch {
      toast.error(t('kb.settingsFailed'))
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-2">
        <Label className="text-[13px]">{t('kb.name')}</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="text-[13px]"
          disabled={!canManage}
        />
      </div>

      <div className="space-y-2">
        <Label className="text-[13px]">{t('kb.description')}</Label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="text-[13px] min-h-[80px]"
          maxLength={2000}
          disabled={!canManage}
        />
      </div>

      <div className="space-y-3 text-[13px]">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20">{t('kb.scope')}:</span>
          <KbScopeBadge scope={kb.scope} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20">{t('kb.createdBy')}:</span>
          <span>{kb.creatorName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20">{t('kb.createdAt')}:</span>
          <span>{new Date(kb.createdAt).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground w-20">{t('kb.documentsTab')}:</span>
          <span>{kb.documentCount}</span>
        </div>
      </div>

      {canManage && (
        <Button
          onClick={handleSave}
          disabled={!isDirty || updateKb.isPending}
        >
          {updateKb.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          {t('save')}
        </Button>
      )}

      {canManage && (
        <div className="mt-8 border-t pt-6">
          <h3 className="mb-2 text-sm font-semibold text-destructive">{t('kb.dangerZone')}</h3>
          <p className="mb-3 text-[12px] text-muted-foreground">
            {t('kb.deleteWarning')}
          </p>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            {t('kb.deleteKb')}
          </Button>
        </div>
      )}
    </div>
  )
}
