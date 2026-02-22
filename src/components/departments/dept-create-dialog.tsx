"use client"

import { useState } from "react"
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
import { Loader2, Building2 } from "lucide-react"
import { toast } from "sonner"
import { useCreateDepartment } from "@/hooks/use-departments"
import { useT } from "@/stores/language-store"

interface DeptCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function DeptCreateDialog({
  open,
  onOpenChange,
}: DeptCreateDialogProps) {
  const t = useT()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")

  const createDept = useCreateDepartment()

  function reset() {
    setName("")
    setDescription("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      await createDept.mutateAsync({
        name,
        description: description || undefined,
      })
      toast.success(t('dept.createdMsg'))
      reset()
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
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Building2 className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('dept.createTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('dept.createDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="dept-name" className="text-[13px]">
              {t('dept.deptName')}
            </Label>
            <Input
              id="dept-name"
              placeholder={t('dept.deptNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dept-desc" className="text-[13px]">
              {t('description')}
              <span className="ml-1 text-muted-foreground">{t('optional')}</span>
            </Label>
            <Textarea
              id="dept-desc"
              placeholder={t('dept.descriptionPlaceholder')}
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
              disabled={createDept.isPending || name.length < 2}
            >
              {createDept.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
