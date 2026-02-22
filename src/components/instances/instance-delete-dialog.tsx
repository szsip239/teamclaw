"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { useDeleteInstance } from "@/hooks/use-instances"
import { useT } from "@/stores/language-store"
import type { InstanceResponse } from "@/types/instance"

interface InstanceDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  instance: InstanceResponse | null
}

export function InstanceDeleteDialog({
  open,
  onOpenChange,
  instance,
}: InstanceDeleteDialogProps) {
  const t = useT()
  const deleteInstance = useDeleteInstance()

  async function handleDelete() {
    if (!instance) return

    try {
      await deleteInstance.mutateAsync(instance.id)
      toast.success(t('instance.deletedMsg', { name: instance.name }))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('instance.deleteFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('instance.deleteTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('instance.deleteCannotUndo')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
          {t('instance.deleteConfirmMsg', { name: instance?.name ?? '' })}
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteInstance.isPending}
          >
            {deleteInstance.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {t('confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
