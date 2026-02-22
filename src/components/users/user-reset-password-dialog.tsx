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
import { Loader2, KeyRound } from "lucide-react"
import { toast } from "sonner"
import { useResetUserPassword } from "@/hooks/use-users"
import type { UserResponse } from "@/types/user"
import { useT } from "@/stores/language-store"

interface UserResetPasswordDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: UserResponse | null
}

export function UserResetPasswordDialog({
  open,
  onOpenChange,
  user,
}: UserResetPasswordDialogProps) {
  const t = useT()
  const [newPassword, setNewPassword] = useState("")
  const resetPassword = useResetUserPassword(user?.id ?? "")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) return

    try {
      await resetPassword.mutateAsync({ newPassword })
      toast.success(t('user.passwordResetMsg', { name: user.name }))
      setNewPassword("")
      onOpenChange(false)
    } catch (err) {
      const message =
        (err as { data?: { error?: string } })?.data?.error || t('user.resetFailed')
      toast.error(message)
    }
  }

  const isValid =
    newPassword.length >= 8 &&
    /[A-Z]/.test(newPassword) &&
    /[a-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
              <KeyRound className="size-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <DialogTitle className="text-base">{t('user.resetPasswordTitle')}</DialogTitle>
              <DialogDescription className="text-[13px]">
                {t('user.resetPasswordDesc', { name: user?.name ?? '' })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-[13px]">
              {t('user.newPassword')}
            </Label>
            <Input
              id="new-password"
              type="password"
              placeholder={t('user.passwordPlaceholder')}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <p className="text-[12px] text-muted-foreground">
              {t('user.passwordHint')}
            </p>
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
              disabled={resetPassword.isPending || !isValid}
            >
              {resetPassword.isPending && (
                <Loader2 className="mr-2 size-4 animate-spin" />
              )}
              {t('user.confirmReset')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
