"use client"

import { Button } from "@/components/ui/button"
import { ArrowLeft, Pencil, Trash2 } from "lucide-react"
import { ResourceTypeBadge } from "./resource-type-badge"
import { ResourceStatusBadge } from "./resource-status-badge"
import { ResourceTestButton } from "./resource-test-button"
import { useT } from "@/stores/language-store"
import type { ResourceDetail } from "@/types/resource"

interface ResourceDetailHeaderProps {
  resource: ResourceDetail
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
}

export function ResourceDetailHeader({
  resource,
  onBack,
  onEdit,
  onDelete,
}: ResourceDetailHeaderProps) {
  const t = useT()
  return (
    <div className="space-y-4">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {t('back')}
      </Button>

      {/* Title row */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-muted to-muted/60 text-lg font-bold uppercase ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
            {resource.provider.slice(0, 2)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{resource.name}</h1>
              {resource.isDefault && (
                <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                  {t('resource.isDefault')}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <ResourceTypeBadge type={resource.type} />
              <ResourceStatusBadge status={resource.status} />
              <span className="text-sm text-muted-foreground">
                {resource.providerName || resource.provider}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ResourceTestButton resourceId={resource.id} />
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-3.5" />
            {t('edit')}
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete}>
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  )
}
