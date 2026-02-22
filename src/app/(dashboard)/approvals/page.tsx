"use client"

import { ClipboardCheck } from "lucide-react"
import { PlaceholderPage } from "@/components/placeholder-page"
import { useT } from "@/stores/language-store"

export default function ApprovalsPage() {
  const t = useT()
  return (
    <PlaceholderPage
      icon={ClipboardCheck}
      title={t('page.approvals')}
      description={t('page.approvalsDesc')}
    />
  )
}
