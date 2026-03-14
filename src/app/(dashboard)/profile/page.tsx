"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UserCircle, KeyRound, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import { api, ApiError } from "@/lib/api-client"
import { toast } from "sonner"

export default function ProfilePage() {
  const t = useT()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()

    if (newPassword !== confirmPassword) {
      toast.error(t('profile.passwordMismatch'))
      return
    }

    setSaving(true)
    try {
      await api.post("/api/v1/auth/change-password", {
        currentPassword,
        newPassword,
      })
      toast.success(t('profile.passwordChanged'))
      // Force re-login after password change
      await logout()
      router.push("/login")
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error(t('profile.currentPasswordWrong'))
      } else {
        toast.error(t('profile.passwordFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  const roleLabel: Record<string, string> = {
    SYSTEM_ADMIN: "System Admin",
    DEPT_ADMIN: "Dept Admin",
    USER: "User",
  }

  return (
    <div className="container max-w-2xl py-8 space-y-6">
      <h1 className="text-2xl font-bold">{t('profile.title')}</h1>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserCircle className="size-5" />
            {t('profile.info')}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-muted-foreground text-xs">{t('profile.name')}</Label>
            <p className="mt-1 text-sm font-medium">{user?.name ?? "-"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">{t('profile.email')}</Label>
            <p className="mt-1 text-sm font-medium">{user?.email ?? "-"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">{t('profile.role')}</Label>
            <p className="mt-1 text-sm font-medium">
              {user?.role ? (roleLabel[user.role] ?? user.role) : "-"}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs">{t('profile.department')}</Label>
            <p className="mt-1 text-sm font-medium">
              {user?.departmentName ?? t('profile.noDepartment')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5" />
            {t('profile.changePassword')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('profile.currentPassword')}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('profile.newPassword')}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('profile.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={saving || !currentPassword || !newPassword || !confirmPassword}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              {t('profile.save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
