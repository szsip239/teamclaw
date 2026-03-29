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
import { Loader2, BookOpen, Globe, Building2, UserCircle } from "lucide-react"
import { toast } from "sonner"
import { useCreateKb } from "@/hooks/use-knowledge-bases"
import { useDepartments } from "@/hooks/use-departments"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import type { KbScope } from "@/types/knowledge-base"
import type { TranslationKey } from "@/locales/zh-CN"

const SCOPE_OPTIONS: { value: KbScope; labelKey: string; icon: typeof Globe; descKey: string; roles: string[] }[] = [
  { value: "GLOBAL", labelKey: "kb.scopeGlobal", icon: Globe, descKey: "kb.scopeGlobalDesc", roles: ["SYSTEM_ADMIN"] },
  { value: "DEPARTMENT", labelKey: "kb.scopeDepartment", icon: Building2, descKey: "kb.scopeDepartmentDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN"] },
  { value: "PERSONAL", labelKey: "kb.scopePersonal", icon: UserCircle, descKey: "kb.scopePersonalDesc", roles: ["SYSTEM_ADMIN", "DEPT_ADMIN", "USER"] },
]

interface KbCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function KbCreateDialog({ open, onOpenChange }: KbCreateDialogProps) {
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [scope, setScope] = useState<KbScope | "">("")
  const [departmentId, setDepartmentId] = useState("")

  const createKb = useCreateKb()
  const { data: deptsData } = useDepartments()
  const departments = deptsData?.departments ?? []

  const availableScopes = SCOPE_OPTIONS.filter(
    (opt) => user && opt.roles.includes(user.role),
  )

  const showDeptSelect = scope === "DEPARTMENT" && user?.role === "SYSTEM_ADMIN"

  function reset() {
    setName("")
    setDescription("")
    setScope("")
    setDepartmentId("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await createKb.mutateAsync({
        name,
        description: description || undefined,
        scope: scope || undefined,
        departmentId: departmentId || undefined,
      })
      toast.success(t('kb.createdMsg', { name }))
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
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-black/[0.04] dark:ring-white/[0.08]">
              <BookOpen className="size-4 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('kb.createTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('kb.createDesc')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label className="text-[13px]">{t('kb.name')}</Label>
            <Input
              placeholder={t('kb.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-[13px]"
              required
            />
          </div>

          <div className="space-y-2">
            <Label className="text-[13px]">{t('kb.description')}</Label>
            <Textarea
              placeholder={t('kb.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-[13px] min-h-[80px]"
              maxLength={2000}
            />
          </div>

          {availableScopes.length > 1 && (
            <div className="space-y-2">
              <Label className="text-[13px]">{t('kb.scope')}</Label>
              <div className="grid grid-cols-3 gap-2">
                {availableScopes.map((opt) => {
                  const isSelected = scope === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all ${
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                          : "hover:border-muted-foreground/30 hover:bg-muted/50"
                      }`}
                      onClick={() => setScope(opt.value)}
                    >
                      <opt.icon className={`size-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      <span className={`text-[12px] font-medium ${isSelected ? "text-primary" : ""}`}>
                        {t(opt.labelKey as TranslationKey)}
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        {t(opt.descKey as TranslationKey)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {showDeptSelect && departments.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[13px]">{t('kb.selectDepartment')}</Label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-[13px]"
              >
                <option value="">{t('kb.selectDepartment')}</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              disabled={createKb.isPending || !name}
            >
              {createKb.isPending && (
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
