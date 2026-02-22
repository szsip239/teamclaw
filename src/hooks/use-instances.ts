"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type {
  InstanceListResponse,
  InstanceResponse,
  InstanceHealthResponse,
  InstanceLogsResponse,
  InstanceConfigResponse,
  CreateInstanceInput,
  UpdateInstanceInput,
  UpdateInstanceConfigInput,
} from "@/types/instance"

// ─── Query Key Factory ───────────────────────────────────────────────

export const instanceKeys = {
  all: ["instances"] as const,
  lists: () => [...instanceKeys.all, "list"] as const,
  list: (params: Record<string, string | undefined>) =>
    [...instanceKeys.lists(), params] as const,
  details: () => [...instanceKeys.all, "detail"] as const,
  detail: (id: string) => [...instanceKeys.details(), id] as const,
  health: (id: string) => [...instanceKeys.all, "health", id] as const,
  config: (id: string) => [...instanceKeys.all, "config", id] as const,
  logs: (id: string) => [...instanceKeys.all, "logs", id] as const,
}

// ─── List ────────────────────────────────────────────────────────────

export function useInstances(params?: {
  page?: number
  pageSize?: number
  status?: string
  search?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.status) searchParams.set("status", params.status)
  if (params?.search) searchParams.set("search", params.search)

  const qs = searchParams.toString()
  const endpoint = `/api/v1/instances${qs ? `?${qs}` : ""}`

  return useQuery({
    queryKey: instanceKeys.list({
      page: params?.page?.toString(),
      status: params?.status,
      search: params?.search,
    }),
    queryFn: () => api.get<InstanceListResponse>(endpoint),
    refetchInterval: 30_000,
  })
}

// ─── Detail ──────────────────────────────────────────────────────────

export function useInstance(id: string | null) {
  return useQuery({
    queryKey: instanceKeys.detail(id!),
    queryFn: () =>
      api.get<{ instance: InstanceResponse }>(`/api/v1/instances/${id}`),
    enabled: !!id,
  })
}

// ─── Health ──────────────────────────────────────────────────────────

export function useInstanceHealth(id: string | null) {
  return useQuery({
    queryKey: instanceKeys.health(id!),
    queryFn: () =>
      api.get<InstanceHealthResponse>(`/api/v1/instances/${id}/health`),
    enabled: !!id,
    refetchInterval: 15_000,
  })
}

// ─── Config ──────────────────────────────────────────────────────────

export function useInstanceConfig(id: string | null) {
  return useQuery({
    queryKey: instanceKeys.config(id!),
    queryFn: () =>
      api.get<InstanceConfigResponse>(`/api/v1/instances/${id}/config`),
    enabled: !!id,
  })
}

// ─── Logs ────────────────────────────────────────────────────────────

export function useInstanceLogs(id: string | null, tail?: number) {
  const qs = tail ? `?tail=${tail}` : ""
  return useQuery({
    queryKey: instanceKeys.logs(id!),
    queryFn: () =>
      api.get<InstanceLogsResponse>(`/api/v1/instances/${id}/logs${qs}`),
    enabled: !!id,
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateInstanceInput) =>
      api.post<{ instance: InstanceResponse }>("/api/v1/instances", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.lists() })
    },
  })
}

export function useUpdateInstance(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateInstanceInput) =>
      api.put<{ instance: InstanceResponse }>(`/api/v1/instances/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.lists() })
      qc.invalidateQueries({ queryKey: instanceKeys.detail(id) })
    },
  })
}

export function useDeleteInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/instances/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.lists() })
    },
  })
}

export function useStartInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/api/v1/instances/${id}/start`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: instanceKeys.lists() })
      qc.invalidateQueries({ queryKey: instanceKeys.detail(id) })
      qc.invalidateQueries({ queryKey: instanceKeys.health(id) })
    },
  })
}

export function useStopInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/api/v1/instances/${id}/stop`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: instanceKeys.lists() })
      qc.invalidateQueries({ queryKey: instanceKeys.detail(id) })
    },
  })
}

export function useRestartInstance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<{ status: string }>(`/api/v1/instances/${id}/restart`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: instanceKeys.lists() })
      qc.invalidateQueries({ queryKey: instanceKeys.detail(id) })
      qc.invalidateQueries({ queryKey: instanceKeys.health(id) })
    },
  })
}

export function useUpdateInstanceConfig(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateInstanceConfigInput) =>
      api.put(`/api/v1/instances/${id}/config`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceKeys.config(id) })
      qc.invalidateQueries({ queryKey: instanceKeys.detail(id) })
    },
  })
}
