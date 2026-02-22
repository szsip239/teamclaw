"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, AlertTriangle } from "lucide-react"
import { useDeleteResource } from "@/hooks/use-resources"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { ResourceOverview } from "@/types/resource"

interface ResourceDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resource: ResourceOverview
  onDeleted?: () => void
}

export function ResourceDeleteDialog({
  open,
  onOpenChange,
  resource,
  onDeleted,
}: ResourceDeleteDialogProps) {
  const t = useT()
  const deleteMutation = useDeleteResource()

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync(resource.id)
      toast.success(t('resource.deletedMsg'))
      onOpenChange(false)
      onDeleted?.()
    } catch {
      toast.error(t('operationFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            {t('resource.deleteTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('resource.deleteConfirmMsg', { name: resource.name })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
