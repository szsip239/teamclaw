"use client"

import { useState } from "react"
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
import { Loader2, UserPlus } from "lucide-react"
import { toast } from "sonner"
import { useCreateUser } from "@/hooks/use-users"
import { api } from "@/lib/api-client"
import { useT } from "@/stores/language-store"

interface UserCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface DepartmentOption {
  id: string
  name: string
}

export function UserCreateDialog({
  open,
  onOpenChange,
}: UserCreateDialogProps) {
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState("USER")
  const [departmentId, setDepartmentId] = useState("")

  const t = useT()
  const createUser = useCreateUser()

  const { data: deptData } = useQuery({
    queryKey: ["departments", "list-all"],
    queryFn: () =>
      api.get<{ departments: DepartmentOption[] }>("/api/v1/departments"),
    enabled: open,
  })

  const departments = deptData?.departments ?? []

  function reset() {
    setEmail("")
    setName("")
    setPassword("")
    setRole("USER")
    setDepartmentId("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      await createUser.mutateAsync({
        email,
        name,
        password,
        role: role as "SYSTEM_ADMIN" | "DEPT_ADMIN" | "USER",
        departmentId: departmentId || undefined,
      })
      toast.success(t('user.createdMsg'))
      reset()
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('user.createFailed')
      toast.error(message)
    }
  }

  const isValid =
    email.length > 0 &&
    name.length >= 2 &&
    password.length >= 8

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <UserPlus className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('user.createTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('user.createDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="create-email" className="text-[13px]">
              {t('user.emailLabel')}
            </Label>
            <Input
              id="create-email"
              type="email"
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-name" className="text-[13px]">
              {t('user.nameLabel')}
            </Label>
            <Input
              id="create-name"
              placeholder={t('user.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-password" className="text-[13px]">
              {t('user.passwordLabel')}
            </Label>
            <Input
              id="create-password"
              type="password"
              placeholder={t('user.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-role" className="text-[13px]">
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
            <Label htmlFor="create-department" className="text-[13px]">
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
              disabled={createUser.isPending || !isValid}
            >
              {createUser.isPending && (
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
