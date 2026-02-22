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
import { useDeleteDepartment } from "@/hooks/use-departments"
import type { DepartmentResponse } from "@/types/department"
import { useT } from "@/stores/language-store"

interface DeptDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  department: DepartmentResponse | null
}

export function DeptDeleteDialog({
  open,
  onOpenChange,
  department,
}: DeptDeleteDialogProps) {
  const t = useT()
  const deleteDept = useDeleteDepartment()

  async function handleDelete() {
    if (!department) return

    try {
      await deleteDept.mutateAsync(department.id)
      toast.success(t('dept.deletedMsg', { name: department.name }))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('dept.deleteFailed')
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
              <DialogTitle className="text-base">{t('dept.deleteTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('dept.deleteCannotUndo')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed text-foreground/80">
          {t('dept.deleteConfirmMsg', { name: department?.name ?? '' })}
          {department && department.userCount > 0 && (
            <span className="mt-1 block text-destructive">
              {t('dept.deleteHasMembers', { n: department.userCount })}
            </span>
          )}
        </div>
        <DialogFooter className="pt-1">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleteDept.isPending}
          >
            {deleteDept.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            {t('delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
