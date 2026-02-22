"use client"

import { Settings } from "lucide-react"
import { PlaceholderPage } from "@/components/placeholder-page"
import { useT } from "@/stores/language-store"

export default function SettingsPage() {
  const t = useT()
  return (
    <PlaceholderPage
      icon={Settings}
      title={t('page.settings')}
      description={t('page.settingsDesc')}
    />
  )
}
