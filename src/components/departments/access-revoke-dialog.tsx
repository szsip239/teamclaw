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
import { useRevokeAccess } from "@/hooks/use-instance-access"
import { useT } from "@/stores/language-store"

interface AccessGrant {
  id: string
  instanceName: string
}

interface AccessRevokeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  grant: AccessGrant | null
}

export function AccessRevokeDialog({
  open,
  onOpenChange,
  grant,
}: AccessRevokeDialogProps) {
  const t = useT()
  const revokeAccess = useRevokeAccess()

  async function handleRevoke() {
    if (!grant) return

    try {
      await revokeAccess.mutateAsync(grant.id)
      toast.success(t('dept.revokeSuccess'))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('dept.revokeFailed')
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
              <DialogTitle className="text-base">{t('dept.revokeTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('dept.revokeDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
          {t('dept.revokeConfirmMsg', { name: grant?.instanceName ?? '' })}
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleRevoke}
            disabled={revokeAccess.isPending}
          >
            {revokeAccess.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {t('dept.confirmRevoke')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
