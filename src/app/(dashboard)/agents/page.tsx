"use client"

import { useState, useMemo } from "react"
import { useQueries } from "@tanstack/react-query"
import { motion } from "motion/react"
import { AlertTriangle } from "lucide-react"
import { AgentPageHeader } from "@/components/agents/agent-page-header"
import { AgentCardGrid } from "@/components/agents/agent-card-grid"
import { AgentCardSkeleton } from "@/components/agents/agent-card-skeleton"
import { AgentEmptyState } from "@/components/agents/agent-empty-state"
import { AgentCreateDialog } from "@/components/agents/agent-create-dialog"
import { AgentDeleteDialog } from "@/components/agents/agent-delete-dialog"
import { AgentCloneDialog } from "@/components/agents/agent-clone-dialog"
import { AgentDetailSheet } from "@/components/agents/agent-detail-sheet"
import { useAgents } from "@/hooks/use-agents"
import { useInstances } from "@/hooks/use-instances"
import { cronKeys } from "@/hooks/use-cron"
import { api } from "@/lib/api-client"
import { useAuthStore } from "@/stores/auth-store"
import { useT } from "@/stores/language-store"
import { hasPermission } from "@/lib/auth/permissions"
import type { AgentOverview, AgentCategory } from "@/types/agent"
import type { CronListResponse } from "@/types/cron"

/** Aggregate cron job counts per agent across multiple instances.
 *  Uses useQueries (single hook) to handle dynamic instance array safely. */
function useCronCountMap(instanceIds: string[]): Map<string, number> {
  const results = useQueries({
    queries: instanceIds.map((id) => ({
      queryKey: cronKeys.list(id),
      queryFn: () =>
        api.get<CronListResponse>(
          `/api/v1/instances/${encodeURIComponent(id)}/cron`,
        ),
      staleTime: 60_000,
    })),
  })

  return useMemo(() => {
    const map = new Map<string, number>()
    for (let i = 0; i < instanceIds.length; i++) {
      const id = instanceIds[i]
      const jobs = results[i]?.data?.jobs
      if (!jobs) continue
      for (const job of jobs) {
        if (!job.agentId) continue
        const key = `${id}:${job.agentId}`
        map.set(key, (map.get(key) ?? 0) + 1)
      }
    }
    return map
  }, [instanceIds, results])
}

export default function AgentsPage() {
  const t = useT()
  const user = useAuthStore((s) => s.user)
  const canManage = user ? hasPermission(user.role, "agents:manage") : false
  const canCreate = user ? hasPermission(user.role, "agents:create") : false

  const [instanceFilter, setInstanceFilter] = useState("all")
  const [categoryFilter, setCategoryFilter] = useState("all")
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteAgent, setDeleteAgent] = useState<AgentOverview | null>(null)
  const [cloneAgent, setCloneAgent] = useState<AgentOverview | null>(null)
  const [detailAgent, setDetailAgent] = useState<AgentOverview | null>(null)

  const { data: agentsData, isLoading: agentsLoading } = useAgents(
    instanceFilter !== "all" ? instanceFilter : undefined,
  )
  const { data: instancesData } = useInstances()

  const allAgents = agentsData?.agents ?? []
  const apiErrors = agentsData?.errors ?? []
  const instances = instancesData?.instances ?? []

  // Fetch cron counts per instance for badge display
  const onlineInstanceIds = useMemo(
    () => instances.filter((i) => i.status === "ONLINE").map((i) => i.id),
    [instances],
  )
  const cronCounts = useCronCountMap(onlineInstanceIds)

  // Client-side category filter (server also filters, but this is for snappy UI)
  const agents = categoryFilter === "all"
    ? allAgents
    : allAgents.filter((a) => a.category === categoryFilter)

  // Build instance name map for dropdowns (with isDocker for workspace defaults)
  const instanceNames = useMemo(
    () => instances.map((i) => ({
      id: i.id,
      name: i.name,
      isDocker: !!i.containerId,
    })),
    [instances],
  )

  // Map error instanceIds to instance names
  const nameMap = useMemo(
    () => new Map(instances.map((i) => [i.id, i.name])),
    [instances],
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      <AgentPageHeader
        canCreate={canCreate}
        onCreateClick={() => setCreateOpen(true)}
        agents={agents}
        instanceFilter={instanceFilter}
        onInstanceFilterChange={setInstanceFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        instanceNames={instanceNames}
      />

      {apiErrors.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t('agent.connectionFailed')}</p>
            <ul className="mt-1 list-inside list-disc text-[13px]">
              {apiErrors.map((err) => (
                <li key={err.instanceId}>
                  {nameMap.get(err.instanceId) || err.instanceId} — {err.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {agentsLoading ? (
        <AgentCardSkeleton />
      ) : agents.length === 0 ? (
        <AgentEmptyState />
      ) : (
        <AgentCardGrid
          agents={agents}
          onSelect={setDetailAgent}
          onClone={(agent) => setCloneAgent(agent)}
          cronCounts={cronCounts}
        />
      )}

      {/* Dialogs */}
      <AgentCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        instances={instanceNames}
      />
      <AgentDeleteDialog
        open={!!deleteAgent}
        onOpenChange={(open) => !open && setDeleteAgent(null)}
        agent={deleteAgent}
      />
      <AgentCloneDialog
        open={!!cloneAgent}
        onOpenChange={(open) => !open && setCloneAgent(null)}
        sourceAgent={cloneAgent}
        instances={instanceNames}
      />
      <AgentDetailSheet
        open={!!detailAgent}
        onOpenChange={(open) => !open && setDetailAgent(null)}
        agent={detailAgent}
        canManage={canManage}
        onDelete={(agent) => {
          setDetailAgent(null)
          setDeleteAgent(agent)
        }}
        onClone={(agent) => {
          setDetailAgent(null)
          setCloneAgent(agent)
        }}
      />
    </motion.div>
  )
}
