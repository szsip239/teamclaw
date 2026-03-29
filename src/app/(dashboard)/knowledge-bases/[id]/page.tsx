"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { FileText, MessageCircle, Settings } from "lucide-react"
import { KbDetailHeader } from "@/components/knowledge-bases/kb-detail-header"
import { KbDocumentsTab } from "@/components/knowledge-bases/kb-documents-tab"
import { KbQaTab } from "@/components/knowledge-bases/kb-qa-tab"
import { KbSettingsTab } from "@/components/knowledge-bases/kb-settings-tab"
import { KbDeleteDialog } from "@/components/knowledge-bases/kb-delete-dialog"
import { useKnowledgeBase } from "@/hooks/use-knowledge-bases"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"

export default function KnowledgeBaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const id = params.id as string

  const { data: kb, isLoading } = useKnowledgeBase(id)
  const [deleteOpen, setDeleteOpen] = useState(false)

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

  // Determine if user can manage this KB
  const canManage = (() => {
    if (!user) return false
    if (user.role === 'SYSTEM_ADMIN') return true
    if (kb.scope === 'GLOBAL') return false
    if (kb.scope === 'DEPARTMENT') {
      return user.role === 'DEPT_ADMIN' && user.departmentId === kb.departmentId
    }
    if (kb.scope === 'PERSONAL') return kb.createdById === user.id
    return false
  })()

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <KbDetailHeader
        kb={kb}
        canManage={canManage}
        onDelete={() => setDeleteOpen(true)}
      />

      <Tabs defaultValue="documents" className="flex-1">
        <TabsList>
          <TabsTrigger value="documents" className="gap-1.5 text-[13px]">
            <FileText className="size-3.5" />
            {t('kb.documentsTab')}
          </TabsTrigger>
          <TabsTrigger value="qa" className="gap-1.5 text-[13px]">
            <MessageCircle className="size-3.5" />
            {t('kb.qaTab')}
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5 text-[13px]">
            <Settings className="size-3.5" />
            {t('kb.settingsTab')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-4">
          <KbDocumentsTab
            kbId={kb.id}
            documents={kb.documents}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="qa" className="mt-4">
          <KbQaTab kbId={kb.id} kbName={kb.name} />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <KbSettingsTab kb={kb} canManage={canManage} />
        </TabsContent>
      </Tabs>

      <KbDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        kb={kb}
        onDeleted={() => router.push("/knowledge-bases")}
      />
    </motion.div>
  )
}
