"use client"

import { useState, useMemo } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useQueries, useQueryClient } from "@tanstack/react-query"
import { motion } from "motion/react"
import { AlertTriangle, Clock, Filter } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { CronJobList } from "@/components/cron/cron-job-list"
import { CronRunHistory } from "@/components/cron/cron-run-history"
import { CronDeleteDialog } from "@/components/cron/cron-delete-dialog"
import { useInstances } from "@/hooks/use-instances"
import { cronKeys } from "@/hooks/use-cron"
import { api } from "@/lib/api-client"
import { useT } from "@/stores/language-store"
import { toast } from "sonner"
import type { CronJob, CronListResponse, CronRunsResponse } from "@/types/cron"

// ─── Annotated job type (tracks source instance) ─────────────────────

type AnnotatedCronJob = CronJob & { _instanceId: string }

// ─── Multi-Instance Aggregator Hook ──────────────────────────────────

function useAllCronJobs(instanceIds: string[]) {
  const results = useQueries({
    queries: instanceIds.map((id) => ({
      queryKey: cronKeys.list(id),
      queryFn: () =>
        api.get<CronListResponse>(
          `/api/v1/instances/${encodeURIComponent(id)}/cron`,
        ),
      staleTime: 30_000,
    })),
  })

  return useMemo(() => {
    const allJobs: AnnotatedCronJob[] = []
    const errors: { instanceId: string; error: string }[] = []
    let isLoading = false

    for (let i = 0; i < instanceIds.length; i++) {
      const id = instanceIds[i]
      const result = results[i]
      if (result.isLoading) isLoading = true
      if (result.data?.jobs) {
        for (const job of result.data.jobs) {
          allJobs.push({ ...job, _instanceId: id })
        }
      }
      if (result.error) {
        errors.push({ instanceId: id, error: (result.error as Error).message })
      }
    }

    return { jobs: allJobs, errors, isLoading }
  }, [instanceIds, results])
}

function useAllCronRuns(instanceIds: string[], jobId?: string | null) {
  const results = useQueries({
    queries: instanceIds.map((id) => {
      const qs = new URLSearchParams()
      if (jobId) qs.set("jobId", jobId)
      qs.set("limit", "50")
      return {
        queryKey: cronKeys.runs(id, jobId ?? undefined),
        queryFn: () =>
          api.get<CronRunsResponse>(
            `/api/v1/instances/${encodeURIComponent(id)}/cron/runs?${qs.toString()}`,
          ),
        staleTime: 30_000,
      }
    }),
  })

  return useMemo(() => {
    const allRuns: CronRunsResponse["runs"] = []
    let isLoading = false

    for (let i = 0; i < instanceIds.length; i++) {
      const result = results[i]
      if (result.isLoading) isLoading = true
      if (result.data?.runs) {
        allRuns.push(...result.data.runs)
      }
    }

    // Sort by startedAt descending
    allRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    return { runs: allRuns, isLoading }
  }, [instanceIds, results])
}

// ─── Page ────────────────────────────────────────────────────────────

export default function CronPage() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // URL-driven state
  const urlInstance = searchParams.get("instance") ?? "all"
  const urlAgent = searchParams.get("agent") ?? "all"
  const urlJob = searchParams.get("job") ?? null

  const [instanceFilter, setInstanceFilter] = useState(urlInstance)
  const [agentFilter, setAgentFilter] = useState(urlAgent)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(urlJob)
  const [statusFilter] = useState<string[]>([])
  const [deletingJob, setDeletingJob] = useState<AnnotatedCronJob | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const { data: instancesData } = useInstances()
  const instances = instancesData?.instances ?? []
  const onlineInstances = instances.filter((i) => i.status === "ONLINE")

  // Determine which instances to query
  const targetInstanceIds = useMemo(() => {
    if (instanceFilter !== "all") return [instanceFilter]
    return onlineInstances.map((i) => i.id)
  }, [instanceFilter, onlineInstances])

  const { jobs, errors, isLoading } = useAllCronJobs(targetInstanceIds)

  // Determine instances for run history query
  const selectedJob = jobs.find((j) => j.jobId === selectedJobId)
  const runQueryInstanceIds = useMemo(() => {
    if (selectedJob?._instanceId) {
      return [selectedJob._instanceId]
    }
    return targetInstanceIds
  }, [selectedJob, targetInstanceIds])

  const { runs, isLoading: runsLoading } = useAllCronRuns(
    runQueryInstanceIds,
    selectedJobId,
  )

  // Extract unique agent IDs from jobs for the filter dropdown
  const agentIds = useMemo(() => {
    const ids = new Set<string>()
    for (const j of jobs) {
      if (j.agentId) ids.add(j.agentId)
    }
    return Array.from(ids).sort()
  }, [jobs])

  // Instance name lookup
  const instanceNameMap = useMemo(
    () => new Map(instances.map((i) => [i.id, i.name])),
    [instances],
  )

  // Update URL when filters change
  function updateFilters(inst: string, agent: string, job: string | null) {
    const params = new URLSearchParams()
    if (inst !== "all") params.set("instance", inst)
    if (agent !== "all") params.set("agent", agent)
    if (job) params.set("job", job)
    const qs = params.toString()
    router.replace(`/cron${qs ? `?${qs}` : ""}`, { scroll: false })
  }

  // ─── Mutation Handlers ──────────────────────────────────────────

  async function handleToggle(job: AnnotatedCronJob, enabled: boolean) {
    try {
      await api.post(
        `/api/v1/instances/${encodeURIComponent(job._instanceId)}/cron/toggle`,
        { jobId: job.jobId, enabled },
      )
      toast.success(t("cron.toggleSuccess"))
      queryClient.invalidateQueries({ queryKey: cronKeys.list(job._instanceId) })
    } catch {
      toast.error(t("cron.actionFailed"))
    }
  }

  async function handleRun(job: AnnotatedCronJob) {
    try {
      await api.post(
        `/api/v1/instances/${encodeURIComponent(job._instanceId)}/cron/run`,
        { jobId: job.jobId },
      )
      toast.success(t("cron.runTriggered"))
      queryClient.invalidateQueries({ queryKey: cronKeys.runs(job._instanceId) })
    } catch {
      toast.error(t("cron.actionFailed"))
    }
  }

  function handleDelete(job: AnnotatedCronJob) {
    setDeletingJob(job)
  }

  async function confirmDelete() {
    if (!deletingJob) return
    setIsDeleting(true)
    try {
      await api.delete(
        `/api/v1/instances/${encodeURIComponent(deletingJob._instanceId)}/cron?jobId=${encodeURIComponent(deletingJob.jobId)}`,
      )
      toast.success(t("cron.deleteJobSuccess"))
      queryClient.invalidateQueries({ queryKey: cronKeys.list(deletingJob._instanceId) })
      queryClient.invalidateQueries({ queryKey: cronKeys.runs(deletingJob._instanceId) })
      setDeletingJob(null)
      if (selectedJobId === deletingJob.jobId) {
        setSelectedJobId(null)
      }
    } catch {
      toast.error(t("cron.actionFailed"))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-1 flex-col gap-6 p-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="size-5" />
            {t("cron.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("cron.titleDesc")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Instance filter */}
          <Select
            value={instanceFilter}
            onValueChange={(v) => {
              setInstanceFilter(v)
              setSelectedJobId(null)
              updateFilters(v, agentFilter, null)
            }}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder={t("cron.selectInstance")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cron.allInstances")}</SelectItem>
              {onlineInstances.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Agent filter */}
          <Select
            value={agentFilter}
            onValueChange={(v) => {
              setAgentFilter(v)
              updateFilters(instanceFilter, v, selectedJobId)
            }}
          >
            <SelectTrigger className="w-[150px]">
              <Filter className="mr-1 size-3.5" />
              <SelectValue placeholder={t("cron.allAgents")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cron.allAgents")}</SelectItem>
              {agentIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Job count badge */}
          <Badge variant="secondary" className="text-xs tabular-nums">
            {t("cron.jobCount").replace("{n}", String(jobs.length))}
          </Badge>
        </div>
      </div>

      {/* Connection errors */}
      {errors.length > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">{t("cron.connectionFailed")}</p>
            <ul className="mt-1 list-inside list-disc text-[13px]">
              {errors.map((err) => (
                <li key={err.instanceId}>
                  {instanceNameMap.get(err.instanceId) ?? err.instanceId} — {err.error}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Main content: single-column vertical layout */}
      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </div>
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Job Cards Grid */}
          <CronJobList
            jobs={jobs}
            selectedJobId={selectedJobId}
            onSelectJob={(id) => {
              setSelectedJobId(id)
              updateFilters(instanceFilter, agentFilter, id)
            }}
            agentFilter={agentFilter}
            onToggle={(job, enabled) => handleToggle(job as AnnotatedCronJob, enabled)}
            onRun={(job) => handleRun(job as AnnotatedCronJob)}
            onDelete={(job) => handleDelete(job as AnnotatedCronJob)}
          />

          {/* Run History Table */}
          <div>
            <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
              <Clock className="size-4" />
              {t("cron.runHistory")}
              {selectedJobId ? (
                <Badge
                  variant="outline"
                  className="text-[10px] font-normal cursor-pointer hover:bg-muted"
                  onClick={() => {
                    setSelectedJobId(null)
                    updateFilters(instanceFilter, agentFilter, null)
                  }}
                >
                  {selectedJob?.name ?? selectedJobId} ✕
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] font-normal">
                  {t("cron.showingAll")}
                </Badge>
              )}
            </h3>
            <CronRunHistory
              runs={runs}
              isLoading={runsLoading}
              selectedJobId={selectedJobId}
              statusFilter={statusFilter}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <CronDeleteDialog
        open={!!deletingJob}
        onOpenChange={(open) => !open && setDeletingJob(null)}
        jobName={deletingJob?.name ?? ""}
        isPending={isDeleting}
        onConfirm={confirmDelete}
      />
    </motion.div>
  )
}
