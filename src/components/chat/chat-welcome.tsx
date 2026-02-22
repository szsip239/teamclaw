"use client"

import { Bot } from "lucide-react"
import { useT } from "@/stores/language-store"

export function ChatWelcome() {
  const t = useT()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4">
      <div className="bg-primary/10 flex size-16 items-center justify-center rounded-full">
        <Bot className="text-primary size-8" />
      </div>
      <div className="text-center">
        <h2 className="text-lg font-semibold">{t('chat.welcome')}</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('chat.welcomeHint')}
        </p>
      </div>
    </div>
  )
}
