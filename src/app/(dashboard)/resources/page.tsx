"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ResourcePageHeader } from "@/components/resources/resource-page-header"
import {
  ResourceCardGrid,
  ResourceCardSkeleton,
  ResourceEmptyState,
} from "@/components/resources/resource-card-grid"
import { ResourceCreateDialog } from "@/components/resources/resource-create-dialog"
import { useResources } from "@/hooks/use-resources"
import { useAuthStore } from "@/stores/auth-store"
import type { ResourceOverview } from "@/types/resource"

export default function ResourcesPage() {
  const router = useRouter()
  const user = useAuthStore((s) => s.user)

  const [typeFilter, setTypeFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)

  const canCreate = user?.role === "SYSTEM_ADMIN"

  const { data, isLoading } = useResources({
    type: typeFilter !== "all" ? typeFilter : undefined,
    search: search || undefined,
  })

  const resources = data?.resources ?? []

  function handleSelectResource(resource: ResourceOverview) {
    router.push(`/resources/${resource.id}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <ResourcePageHeader
        canCreate={canCreate}
        onCreateClick={() => setCreateOpen(true)}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        search={search}
        onSearchChange={setSearch}
        total={data?.total}
      />

      {isLoading ? (
        <ResourceCardSkeleton />
      ) : resources.length === 0 ? (
        <ResourceEmptyState />
      ) : (
        <ResourceCardGrid
          resources={resources}
          onSelect={handleSelectResource}
        />
      )}

      <ResourceCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
    </motion.div>
  )
}
