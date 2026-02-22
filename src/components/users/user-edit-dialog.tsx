"use client"

import { useEffect, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Pencil } from "lucide-react"
import { toast } from "sonner"
import { useUpdateUser } from "@/hooks/use-users"
import { api } from "@/lib/api-client"
import type { UserResponse } from "@/types/user"
import { useT } from "@/stores/language-store"

interface UserEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserResponse | null
}

interface DepartmentOption {
  id: string
  name: string
}

export function UserEditDialog({
  open,
  onOpenChange,
  user,
}: UserEditDialogProps) {
  const [name, setName] = useState("")
  const [role, setRole] = useState("USER")
  const [departmentId, setDepartmentId] = useState("")
  const [status, setStatus] = useState("ACTIVE")

  const t = useT()
  const updateUser = useUpdateUser(user?.id ?? "")

  const { data: deptData } = useQuery({
    queryKey: ["departments", "list-all"],
    queryFn: () =>
      api.get<{ departments: DepartmentOption[] }>("/api/v1/departments"),
    enabled: open,
  })

  const departments = deptData?.departments ?? []

  useEffect(() => {
    if (user) {
      setName(user.name)
      setRole(user.role)
      setDepartmentId(user.departmentId ?? "")
      setStatus(user.status)
    }
  }, [user])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    try {
      const payload: Record<string, unknown> = {}
      if (name !== user.name) payload.name = name
      if (role !== user.role) payload.role = role
      if ((departmentId || null) !== (user.departmentId ?? null))
        payload.departmentId = departmentId || null
      if (status !== user.status) payload.status = status

      await updateUser.mutateAsync(
        payload as {
          name?: string
          role?: "SYSTEM_ADMIN" | "DEPT_ADMIN" | "USER"
          departmentId?: string | null
          status?: "ACTIVE" | "DISABLED"
        },
      )
      toast.success(t('user.updatedMsg'))
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('user.updateFailed')
      toast.error(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-muted ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <Pencil className="size-4 text-muted-foreground" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('user.editTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('user.editDesc', { name: user?.name ?? '' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="edit-name" className="text-[13px]">
              {t('user.nameLabel')}
            </Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-role" className="text-[13px]">
              {t('user.roleLabel')}
            </Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USER">{t('user.roleUser')}</SelectItem>
                <SelectItem value="DEPT_ADMIN">{t('user.roleDeptAdmin')}</SelectItem>
                <SelectItem value="SYSTEM_ADMIN">{t('user.roleSystemAdmin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-department" className="text-[13px]">
              {t('user.departmentLabel')}
              <span className="ml-1 text-muted-foreground">{t('optional')}</span>
            </Label>
            <Select
              value={departmentId || "__none__"}
              onValueChange={(v) => setDepartmentId(v === "__none__" ? "" : v)}
            >
              <SelectTrigger className="text-[13px]">
                <SelectValue placeholder={t('user.selectDepartment')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">{t('none')}</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-status" className="text-[13px]">
              {t('user.statusLabel')}
            </Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">{t('user.statusActive')}</SelectItem>
                <SelectItem value="DISABLED">{t('user.statusDisabledShort')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={updateUser.isPending}>
              {updateUser.isPending && (
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
