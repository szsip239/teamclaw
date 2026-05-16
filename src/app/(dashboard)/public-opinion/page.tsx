'use client'

import { Radar } from 'lucide-react'

import { PlaceholderPage } from '@/components/placeholder-page'
import { useT } from '@/stores/language-store'

export default function PublicOpinionPage() {
  const t = useT()

  return (
    <PlaceholderPage
      icon={Radar}
      title={t('page.publicOpinion')}
      description={t('page.publicOpinionDesc')}
    />
  )
}
