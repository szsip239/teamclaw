"use client"

import { LOGO_SRC } from "@/lib/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { useT } from "@/stores/language-store"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="relative grid min-h-svh lg:grid-cols-2">
      {/* Theme toggle in corner */}
      <div className="absolute top-4 right-4 z-50">
        <ThemeToggle />
      </div>

      {/* Left decorative panel */}
      <div className="bg-primary relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        {/* Abstract pattern overlay */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -top-24 -left-24 size-96 rounded-full bg-white/20" />
          <div className="absolute -right-12 -bottom-12 size-72 rounded-full bg-white/15" />
          <div className="absolute top-1/2 left-1/3 size-48 rounded-full bg-white/10" />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="size-10 overflow-hidden rounded-lg bg-white/15 shadow-sm ring-1 ring-white/20">
            <img src={LOGO_SRC} alt="TeamClaw" className="size-full object-cover" />
          </div>
          <span className="text-xl font-bold tracking-tight text-white">
            TeamClaw
          </span>
        </div>

        {/* Tagline */}
        <div className="relative z-10 space-y-4">
          <h2 className="text-3xl leading-snug font-semibold tracking-tight text-white whitespace-pre-line">
            {t('auth.tagline')}
          </h2>
          <p className="max-w-sm text-base leading-relaxed text-white/75">
            {t('auth.taglineDesc')}
          </p>
        </div>

        <div className="relative z-10">
          <p className="text-sm text-white/50">
            TeamClaw &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  )
}
