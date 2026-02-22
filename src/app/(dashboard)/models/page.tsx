"use client"

import { Brain } from "lucide-react"
import { PlaceholderPage } from "@/components/placeholder-page"
import { useT } from "@/stores/language-store"

export default function ModelsPage() {
  const t = useT()
  return (
    <PlaceholderPage
      icon={Brain}
      title={t('page.models')}
      description={t('page.modelsDesc')}
    />
  )
}
