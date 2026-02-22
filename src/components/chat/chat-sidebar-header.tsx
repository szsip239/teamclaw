"use client"

import { useT } from "@/stores/language-store"

export function ChatSidebarHeader() {
  const t = useT()
  return (
    <div className="flex h-14 items-center px-4">
      <span className="text-sm font-semibold">{t('chat.title')}</span>
    </div>
  )
}
