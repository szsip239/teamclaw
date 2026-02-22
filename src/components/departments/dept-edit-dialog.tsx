"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useUpdateDepartment } from "@/hooks/use-departments"
import type { DepartmentResponse } from "@/types/department"
import { useT } from "@/stores/language-store"

interface DeptEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  department: DepartmentResponse | null
}

export function DeptEditDialog({
  open,
  onOpenChange,
  department,
}: DeptEditDialogProps) {
  const t = useT()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const updateDept = useUpdateDepartment(department?.id ?? "")

  useEffect(() => {
    if (department) {
      setName(department.name)
      setDescription(department.description || "")
    }
  }, [department])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!department) return

    try {
      await updateDept.mutateAsync({
        name,
        description: description || null,
      })
      toast.success(t('dept.updatedMsg'))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('operationFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Pencil className="size-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('dept.editTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('dept.editDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="edit-dept-name" className="text-[13px]">
              {t('dept.deptName')}
            </Label>
            <Input
              id="edit-dept-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-dept-desc" className="text-[13px]">
              {t('description')}
              <span className="ml-1 text-muted-foreground">{t('optional')}</span>
            </Label>
            <Textarea
              id="edit-dept-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateDept.isPending || name.length < 2}
            >
              {updateDept.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
