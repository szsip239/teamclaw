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
import { useT } from "@/stores/language-store"

interface CronDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  jobName: string
  isPending: boolean
  onConfirm: () => void
}

export function CronDeleteDialog({
  open,
  onOpenChange,
  jobName,
  isPending,
  onConfirm,
}: CronDeleteDialogProps) {
  const t = useT()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
              <AlertTriangle className="size-4 text-destructive" />
            </div>
            <div>
              <DialogTitle className="text-base">
                {t("cron.confirmDeleteTitle")}
              </DialogTitle>
              <DialogDescription className="text-[13px]">
                {t("cron.actionDelete")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
          {t("cron.confirmDeleteDesc").replace("{name}", jobName)}
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("confirmDelete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
