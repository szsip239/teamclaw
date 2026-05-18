'use client'

import { useState, useSyncExternalStore } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'motion/react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { FileText, MessageCircle, Settings } from 'lucide-react'
import { KbDetailHeader } from '@/components/knowledge-bases/kb-detail-header'
import { KbDocumentsTab } from '@/components/knowledge-bases/kb-documents-tab'
import { KbQaTab } from '@/components/knowledge-bases/kb-qa-tab'
import { KbSettingsTab } from '@/components/knowledge-bases/kb-settings-tab'
import { KbDeleteDialog } from '@/components/knowledge-bases/kb-delete-dialog'
import { useKnowledgeBase } from '@/hooks/use-knowledge-bases'
import { useAuthStore } from '@/stores/auth-store'
import { useT } from '@/stores/language-store'

type DetailTab = 'documents' | 'qa' | 'settings'

const TAB_HASH_CHANGE_EVENT = 'teamclaw:kb-tab-hash-change'

function getTabFromLocation(): DetailTab {
  if (typeof window === 'undefined') return 'documents'
  const hash = window.location.hash.replace(/^#/, '')
  if (hash === 'qa' || hash === 'settings') return hash
  return 'documents'
}

function subscribeTabHashChange(onStoreChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('hashchange', onStoreChange)
  window.addEventListener('popstate', onStoreChange)
  window.addEventListener(TAB_HASH_CHANGE_EVENT, onStoreChange)
  return () => {
    window.removeEventListener('hashchange', onStoreChange)
    window.removeEventListener('popstate', onStoreChange)
    window.removeEventListener(TAB_HASH_CHANGE_EVENT, onStoreChange)
  }
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const id = params.id as string

  const { data: kb, isLoading } = useKnowledgeBase(id)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Determine if user can manage this KB before deriving the active tab,
  // because unauthorized users should never land on settings from a hash.
  const canManage = (() => {
    if (!user || !kb) return false
    if (user.role === 'SYSTEM_ADMIN') return true
    if (kb.scope === 'GLOBAL') return false
    if (kb.scope === 'DEPARTMENT') {
      return user.role === 'DEPT_ADMIN' && user.departmentId === kb.departmentId
    }
    if (kb.scope === 'PERSONAL') return kb.createdById === user.id
    return false
  })()

  const requestedTab = useSyncExternalStore(
    subscribeTabHashChange,
    getTabFromLocation,
    () => 'documents',
  )
  const activeTab = requestedTab === 'settings' && !canManage ? 'documents' : requestedTab

  function handleTabChange(next: string) {
    // Non-admin users can never reach the settings tab.
    if (next !== 'documents' && next !== 'qa' && next !== 'settings') return
    if (next === 'settings' && !canManage) return
    if (typeof window !== 'undefined') {
      const newHash = next === 'documents' ? '' : `#${next}`
      const url = `${window.location.pathname}${window.location.search}${newHash}`
      window.history.replaceState(null, '', url)
      window.dispatchEvent(new Event(TAB_HASH_CHANGE_EVENT))
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-6 w-48" />
        </div>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!kb) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('noData')}</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 px-3 py-2">
          <KbDetailHeader kb={kb}>
            <TabsList>
              <TabsTrigger value="documents" className="gap-1.5 text-[13px]">
                <FileText className="size-3.5" />
                {t('kb.documentsTab')}
              </TabsTrigger>
              <TabsTrigger value="qa" className="gap-1.5 text-[13px]">
                <MessageCircle className="size-3.5" />
                {t('kb.qaTab')}
              </TabsTrigger>
              {canManage && (
                <TabsTrigger value="settings" className="gap-1.5 text-[13px]">
                  <Settings className="size-3.5" />
                  {t('kb.settingsTab')}
                </TabsTrigger>
              )}
            </TabsList>
          </KbDetailHeader>
        </div>

        <TabsContent
          value="documents"
          className="m-0 flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6 data-[state=inactive]:hidden"
        >
          <KbDocumentsTab kbId={kb.id} documents={kb.documents} canManage={canManage} />
        </TabsContent>

        <TabsContent
          value="qa"
          className="m-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
        >
          <KbQaTab kbId={kb.id} kbName={kb.name} documents={kb.documents} />
        </TabsContent>

        {canManage && (
          <TabsContent
            value="settings"
            className="m-0 flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6 data-[state=inactive]:hidden"
          >
            <KbSettingsTab kb={kb} canManage={canManage} onDelete={() => setDeleteOpen(true)} />
          </TabsContent>
        )}
      </Tabs>

      <KbDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        kb={kb}
        onDeleted={() => router.push('/knowledge-bases')}
      />
    </motion.div>
  )
}
