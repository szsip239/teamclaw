"use client"

import { Clock } from "lucide-react"
import { useT } from "@/stores/language-store"
import { CronJobCard } from "./cron-job-card"
import type { CronJob } from "@/types/cron"

interface CronJobListProps {
  jobs: (CronJob & { _instanceId?: string })[]
  selectedJobId: string | null
  onSelectJob: (jobId: string | null) => void
  agentFilter: string
  onToggle?: (job: CronJob & { _instanceId?: string }, enabled: boolean) => void
  onRun?: (job: CronJob & { _instanceId?: string }) => void
  onDelete?: (job: CronJob & { _instanceId?: string }) => void
}

export function CronJobList({
  jobs,
  selectedJobId,
  onSelectJob,
  agentFilter,
  onToggle,
  onRun,
  onDelete,
}: CronJobListProps) {
  const t = useT()

  const filteredJobs =
    agentFilter === "all"
      ? jobs
      : jobs.filter((j) => j.agentId === agentFilter)

  if (filteredJobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Clock className="size-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            {t("cron.noJobs")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {t("cron.noJobsHint")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {filteredJobs.map((job) => (
        <CronJobCard
          key={job.jobId}
          job={job}
          isSelected={selectedJobId === job.jobId}
          onClick={() =>
            onSelectJob(selectedJobId === job.jobId ? null : job.jobId)
          }
          onToggle={onToggle ? (enabled) => onToggle(job, enabled) : undefined}
          onRun={onRun ? () => onRun(job) : undefined}
          onDelete={onDelete ? () => onDelete(job) : undefined}
        />
      ))}
    </div>
  )
}
