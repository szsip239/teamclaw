"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { CronListResponse, CronRunsResponse } from "@/types/cron"

// ─── Query Key Factory ───────────────────────────────────────────────

export const cronKeys = {
  all: ["cron"] as const,
  list: (instanceId: string) => [...cronKeys.all, "list", instanceId] as const,
  runs: (instanceId: string, jobId?: string) =>
    [...cronKeys.all, "runs", instanceId, jobId] as const,
}

// ─── Cron Jobs List ─────────────────────────────────────────────────

export function useCronJobs(instanceId: string | null) {
  return useQuery({
    queryKey: cronKeys.list(instanceId!),
    queryFn: () =>
      api.get<CronListResponse>(
        `/api/v1/instances/${encodeURIComponent(instanceId!)}/cron`,
      ),
    enabled: !!instanceId,
    staleTime: 30_000,
  })
}

// ─── Cron Run History ───────────────────────────────────────────────

export function useCronRuns(instanceId: string | null, jobId?: string) {
  const qs = new URLSearchParams()
  if (jobId) qs.set("jobId", jobId)
  qs.set("limit", "50")
  const queryStr = qs.toString()

  return useQuery({
    queryKey: cronKeys.runs(instanceId!, jobId),
    queryFn: () =>
      api.get<CronRunsResponse>(
        `/api/v1/instances/${encodeURIComponent(instanceId!)}/cron/runs?${queryStr}`,
      ),
    enabled: !!instanceId,
    staleTime: 30_000,
  })
}

// ─── Mutation Hooks ─────────────────────────────────────────────────

export function useToggleCronJob(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ jobId, enabled }: { jobId: string; enabled: boolean }) =>
      api.post(
        `/api/v1/instances/${encodeURIComponent(instanceId)}/cron/toggle`,
        { jobId, enabled },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cronKeys.list(instanceId) })
    },
  })
}

export function useRunCronJob(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) =>
      api.post(
        `/api/v1/instances/${encodeURIComponent(instanceId)}/cron/run`,
        { jobId },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cronKeys.runs(instanceId) })
    },
  })
}

export function useDeleteCronJob(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (jobId: string) =>
      api.delete(
        `/api/v1/instances/${encodeURIComponent(instanceId)}/cron?jobId=${encodeURIComponent(jobId)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cronKeys.list(instanceId) })
      qc.invalidateQueries({ queryKey: cronKeys.runs(instanceId) })
    },
  })
}
