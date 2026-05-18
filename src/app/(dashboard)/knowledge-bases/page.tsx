"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { KbPageHeader } from "@/components/knowledge-bases/kb-page-header"
import { KbCardGrid } from "@/components/knowledge-bases/kb-card-grid"
import { KbCardSkeleton } from "@/components/knowledge-bases/kb-card-skeleton"
import { KbEmptyState } from "@/components/knowledge-bases/kb-empty-state"
import { KbCreateDialog } from "@/components/knowledge-bases/kb-create-dialog"
import { useKnowledgeBases } from "@/hooks/use-knowledge-bases"
import { useAuthStore } from "@/stores/auth-store"
import type { KnowledgeBaseOverview } from "@/types/knowledge-base"

export default function KnowledgeBasesPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const [scopeFilter, setScopeFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  const canCreate = !!user

  const { data, isLoading } = useKnowledgeBases({
    scope: scopeFilter !== "all" ? scopeFilter : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    search: search || undefined,
  })

  const knowledgeBases = data?.knowledgeBases ?? []

  function handleSelect(kb: KnowledgeBaseOverview) {
    router.push(`/knowledge-bases/${kb.id}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <KbPageHeader
        canCreate={canCreate}
        onCreateClick={() => setCreateOpen(true)}
        knowledgeBases={knowledgeBases}
        scopeFilter={scopeFilter}
        onScopeFilterChange={setScopeFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        search={search}
        onSearchChange={setSearch}
      />

      {isLoading ? (
        <KbCardSkeleton />
      ) : knowledgeBases.length === 0 ? (
        <KbEmptyState />
      ) : (
        <KbCardGrid
          knowledgeBases={knowledgeBases}
          onSelect={handleSelect}
        />
      )}

      <KbCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </motion.div>
  )
}
