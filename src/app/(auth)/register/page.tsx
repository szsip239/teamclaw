"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod/v4"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { motion } from "motion/react"
import { Eye, EyeOff, Loader2, Check, X } from "lucide-react"
import { LOGO_SRC } from "@/lib/logo"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import { ApiError } from "@/lib/api-client"

function PasswordStrengthIndicator({ password }: { password: string }) {
  const t = useT()
  const checks = useMemo(() => {
    return [
      { label: t('auth.strengthChars'), pass: password.length >= 8 },
      { label: t('auth.strengthLowercase'), pass: /[a-z]/.test(password) },
      { label: t('auth.strengthUppercase'), pass: /[A-Z]/.test(password) },
      { label: t('auth.strengthDigit'), pass: /[0-9]/.test(password) },
    ]
  }, [password, t])

  const passCount = checks.filter((c) => c.pass).length

  return (
    <div className="space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < passCount
                ? passCount <= 1
                  ? "bg-destructive"
                  : passCount <= 2
                    ? "bg-orange-400"
                    : passCount <= 3
                      ? "bg-yellow-400"
                      : "bg-emerald-500"
                : "bg-muted"
            }`}
          />
        ))}
      </div>
      {/* Requirements */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center gap-1.5">
            {check.pass ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <X className="text-muted-foreground size-3" />
            )}
            <span
              className={`text-xs ${check.pass ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
            >
              {check.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const router = useRouter()
  const registerFn = useAuthStore((s) => s.register)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const t = useT()

  const registerSchema = z
    .object({
      name: z.string().min(2, t('auth.nameMinLength')),
      email: z.email(t('auth.emailInvalid')),
      password: z
        .string()
        .min(8, t('auth.passwordMinLength'))
        .regex(/[a-z]/, t('auth.passwordLowercase'))
        .regex(/[A-Z]/, t('auth.passwordUppercase'))
        .regex(/[0-9]/, t('auth.passwordDigit')),
      confirmPassword: z.string().min(1, t('auth.confirmPasswordRequired')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('auth.passwordMismatch'),
      path: ["confirmPassword"],
    })

  type RegisterForm = z.infer<typeof registerSchema>

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  })

  const watchPassword = watch("password")

  async function onSubmit(data: RegisterForm) {
    try {
      await registerFn(data.email, data.password, data.name)
      toast.success(t('auth.registerSuccess'))
      router.push("/chat")
    } catch (error) {
      if (error instanceof ApiError) {
        const msg =
          (error.data as { error?: string })?.error ?? t('auth.registerFailed')
        toast.error(msg)
      } else {
        toast.error(t('auth.networkError'))
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Mobile logo */}
      <div className="mb-8 flex items-center gap-2.5 lg:hidden">
        <div className="size-9 overflow-hidden rounded-lg">
          <img src={LOGO_SRC} alt="TeamClaw" className="size-full object-cover" />
        </div>
        <span className="text-lg font-bold tracking-tight">TeamClaw</span>
      </div>

      <Card className="border-0 shadow-none lg:border lg:shadow-sm">
        <CardHeader className="space-y-1 px-0 lg:px-6">
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t('auth.registerTitle')}
          </CardTitle>
          <CardDescription>{t('auth.registerSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="px-0 lg:px-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">{t('auth.name')}</Label>
              <Input
                id="name"
                type="text"
                placeholder={t('auth.namePlaceholder')}
                autoComplete="name"
                autoFocus
                {...register("name")}
                aria-invalid={!!errors.name}
              />
              {errors.name && (
                <p className="text-destructive text-sm">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                {...register("email")}
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <p className="text-destructive text-sm">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder={t('auth.setPassword')}
                  autoComplete="new-password"
                  className="pr-10"
                  {...register("password")}
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {watchPassword && (
                <PasswordStrengthIndicator password={watchPassword} />
              )}
              {errors.password && (
                <p className="text-destructive text-sm">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  autoComplete="new-password"
                  className="pr-10"
                  {...register("confirmPassword")}
                  aria-invalid={!!errors.confirmPassword}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="text-destructive text-sm">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('auth.registering')}
                </>
              ) : (
                t('auth.register')
              )}
            </Button>
          </form>

          {/* Login link */}
          <p className="text-muted-foreground mt-6 text-center text-sm">
            {t('auth.hasAccount')}{" "}
            <Link
              href="/login"
              className="text-primary hover:text-primary/80 font-medium transition-colors"
            >
              {t('auth.loginNow')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
