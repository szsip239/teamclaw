"use client"

import { usePathname } from "next/navigation"
import { Github } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { ThemeToggle } from "@/components/theme-toggle"
import { LanguageToggle } from "@/components/language-toggle"
import { useT } from "@/stores/language-store"
import type { TranslationKey } from "@/locales/zh-CN"

const GITHUB_URL = "https://github.com/szsip239/teamclaw"

const pageTitleKeys: Record<string, TranslationKey> = {
  "/": "page.dashboard",
  "/chat": "page.chat",
  "/instances": "page.instances",
  "/agents": "page.agents",
  "/skills": "page.skills",
  "/cron": "page.cron",
  "/users": "page.users",
  "/departments": "page.departments",
  "/resources": "page.resources",
  "/models": "page.models",
  "/approvals": "page.approvals",
  "/logs": "page.logs",
  "/settings": "page.settings",
}

function resolveTitleKey(pathname: string): TranslationKey | null {
  if (pageTitleKeys[pathname]) return pageTitleKeys[pathname]
  if (/^\/instances\/[^/]+\/config$/.test(pathname)) return "page.advancedConfig"
  if (/^\/skills\/[^/]+$/.test(pathname)) return "page.skillDetail"
  return null
}

export function DashboardHeader() {
  const pathname = usePathname()
  const t = useT()
  const titleKey = resolveTitleKey(pathname)
  const title = titleKey ? t(titleKey) : "TeamClaw"

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-4" />
      <h1 className="text-sm font-medium">{title}</h1>
      <div className="ml-auto flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
        <Separator orientation="vertical" className="mx-1 h-4" />
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground inline-flex size-9 items-center justify-center rounded-md transition-colors"
          aria-label="GitHub"
        >
          <Github className="size-4" />
        </a>
      </div>
    </header>
  )
}
