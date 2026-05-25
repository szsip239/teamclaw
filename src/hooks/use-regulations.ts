'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import type {
  BatchCheckUpdatesResult,
  CheckUpdatesResult,
  PendingStatus,
  PendingUpdateItem,
  RegulationTrackerDetail,
  RegulationTrackerListResponse,
} from '@/types/regulation'

export const regulationKeys = {
  all: ['regulations'] as const,
  list: () => [...regulationKeys.all, 'list'] as const,
  detail: (id: string) => [...regulationKeys.all, 'detail', id] as const,
}

export function useRegulationTrackers() {
  return useQuery({
    queryKey: regulationKeys.list(),
    queryFn: () => api.get<RegulationTrackerListResponse>('/api/v1/regulations'),
  })
}

export function useRegulationTracker(id: string | null) {
  return useQuery({
    queryKey: regulationKeys.detail(id!),
    queryFn: () => api.get<RegulationTrackerDetail>(`/api/v1/regulations/${id}`),
    enabled: !!id,
  })
}

export function useCreateRegulationTracker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { knowledgeBaseId: string; name?: string }) =>
      api.post<{ id: string; name: string }>('/api/v1/regulations', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
    },
  })
}

export function useDeleteRegulationTracker() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/api/v1/regulations/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
    },
  })
}

export function useMarkRegulationChecked(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<{ lastCheckedAt: string | null }>(`/api/v1/regulations/${id}/check`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
      qc.invalidateQueries({ queryKey: regulationKeys.detail(id) })
    },
  })
}

export function useUpdateRegulationTracker(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name?: string; keywords?: string[]; notifyChannels?: string[]; searchCron?: string | null }) =>
      api.patch<{ id: string; name: string; keywords: string[] }>(`/api/v1/regulations/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
      qc.invalidateQueries({ queryKey: regulationKeys.detail(id) })
    },
  })
}

export function useRunCheckUpdates(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<CheckUpdatesResult>(`/api/v1/regulations/${id}/check-updates`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
      qc.invalidateQueries({ queryKey: regulationKeys.detail(id) })
    },
  })
}

export function useRunCheckUpdatesAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.post<BatchCheckUpdatesResult>('/api/v1/regulations/check-all', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.all })
    },
  })
}

export function useUpdatePendingStatus(trackerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; status: PendingStatus }) =>
      api.patch<PendingUpdateItem>(`/api/v1/regulations/pending/${input.id}`, {
        status: input.status,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.detail(trackerId) })
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
    },
  })
}

export function useDeletePendingUpdate(trackerId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/api/v1/regulations/pending/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: regulationKeys.detail(trackerId) })
      qc.invalidateQueries({ queryKey: regulationKeys.list() })
    },
  })
}
