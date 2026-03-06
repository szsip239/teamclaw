"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { SkillPageHeader } from "@/components/skills/skill-page-header"
import { SkillCardGrid } from "@/components/skills/skill-card-grid"
import { SkillCardSkeleton } from "@/components/skills/skill-card-skeleton"
import { SkillEmptyState } from "@/components/skills/skill-empty-state"
import { SkillCreateDialog } from "@/components/skills/skill-create-dialog"
import { useSkills } from "@/hooks/use-skills"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import { AlertTriangle } from "lucide-react"
import type { SkillOverview } from "@/types/skill"

export default function SkillsPage() {
  const router = useRouter()
  const t = useT()
  const user = useAuthStore((s) => s.user)

  const [categoryFilter, setCategoryFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  // Determine if user can create skills (all roles can create at least PERSONAL)
  const canCreate = !!user

  const { data, isLoading, isError } = useSkills({
    category: categoryFilter !== "all" ? categoryFilter : undefined,
    source: sourceFilter !== "all" ? sourceFilter : undefined,
    search: search || undefined,
  })

  const skills = data?.skills ?? []

  function handleSelectSkill(skill: SkillOverview) {
    router.push(`/skills/${skill.id}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <SkillPageHeader
        canCreate={canCreate}
        onCreateClick={() => setCreateOpen(true)}
        skills={skills}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        sourceFilter={sourceFilter}
        onSourceFilterChange={setSourceFilter}
        search={search}
        onSearchChange={setSearch}
      />

      {isLoading ? (
        <SkillCardSkeleton />
      ) : isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {t('skill.loadFailed')}
        </div>
      ) : skills.length === 0 ? (
        <SkillEmptyState />
      ) : (
        <SkillCardGrid
          skills={skills}
          onSelect={handleSelectSkill}
        />
      )}

      <SkillCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </motion.div>
  )
}
