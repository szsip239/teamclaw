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
import { useDeleteUser } from "@/hooks/use-users"
import type { UserResponse } from "@/types/user"
import { useT } from "@/stores/language-store"

interface UserDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserResponse | null
}

export function UserDeleteDialog({
  open,
  onOpenChange,
  user,
}: UserDeleteDialogProps) {
  const t = useT()
  const deleteUser = useDeleteUser()

  async function handleDelete() {
    if (!user) return

    try {
      await deleteUser.mutateAsync(user.id)
      toast.success(t('user.deletedMsg', { name: user.name }))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
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
              <DialogTitle className="text-base">{t('user.deleteTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('user.deleteDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
          {t('user.deleteConfirmMsg', { name: user?.name ?? '' })}
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteUser.isPending}
          >
            {deleteUser.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {t('user.confirmDisable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
