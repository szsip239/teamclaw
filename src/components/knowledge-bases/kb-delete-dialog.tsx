"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useDeleteKb } from "@/hooks/use-knowledge-bases"
import { useT } from "@/stores/language-store"

interface KbDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kb: { id: string; name: string } | null
  onDeleted?: () => void
}

export function KbDeleteDialog({ open, onOpenChange, kb, onDeleted }: KbDeleteDialogProps) {
  const t = useT()
  const deleteKb = useDeleteKb()

  async function handleDelete() {
    if (!kb) return
    try {
      await deleteKb.mutateAsync(kb.id)
      toast.success(t('kb.deletedMsg', { name: kb.name }))
      onOpenChange(false)
      onDeleted?.()
    } catch {
      toast.error(t('operationFailed'))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('kb.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {kb ? t('kb.deleteConfirmMsg', { name: kb.name }) : ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteKb.isPending}
          >
            {deleteKb.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
