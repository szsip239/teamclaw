"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type {
  ResourceListResponse,
  ResourceDetail,
  TestConnectionResult,
  ProviderListResponse,
} from "@/types/resource"
import type {
  CreateResourceInput,
  UpdateResourceInput,
} from "@/lib/validations/resource"

// ─── Query Key Factory ───────────────────────────────────────────────

export const resourceKeys = {
  all: ["resources"] as const,
  lists: () => [...resourceKeys.all, "list"] as const,
  list: (params?: Record<string, string>) =>
    [...resourceKeys.lists(), params ?? {}] as const,
  details: () => [...resourceKeys.all, "detail"] as const,
  detail: (id: string) => [...resourceKeys.details(), id] as const,
  providers: () => [...resourceKeys.all, "providers"] as const,
}

// ─── List ────────────────────────────────────────────────────────────

export function useResources(params?: {
  page?: number
  pageSize?: number
  type?: string
  provider?: string
  status?: string
  search?: string
}) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set("page", String(params.page))
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params?.type && params.type !== "all") qs.set("type", params.type)
  if (params?.provider) qs.set("provider", params.provider)
  if (params?.status && params.status !== "all")
    qs.set("status", params.status)
  if (params?.search) qs.set("search", params.search)

  const qsStr = qs.toString()
  return useQuery({
    queryKey: resourceKeys.list(params as Record<string, string> | undefined),
    queryFn: () =>
      api.get<ResourceListResponse>(
        `/api/v1/resources${qsStr ? `?${qsStr}` : ""}`,
      ),
  })
}

// ─── Detail ──────────────────────────────────────────────────────────

export function useResource(id: string | null) {
  return useQuery({
    queryKey: resourceKeys.detail(id!),
    queryFn: () => api.get<ResourceDetail>(`/api/v1/resources/${id}`),
    enabled: !!id,
  })
}

// ─── Providers ───────────────────────────────────────────────────────

export function useProviders(type?: string) {
  const qs = type && type !== "all" ? `?type=${type}` : ""
  return useQuery({
    queryKey: [...resourceKeys.providers(), type ?? "all"],
    queryFn: () =>
      api.get<ProviderListResponse>(`/api/v1/resources/providers${qs}`),
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateResource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateResourceInput) =>
      api.post<ResourceDetail>("/api/v1/resources", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: resourceKeys.lists() })
    },
  })
}

export function useUpdateResource(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateResourceInput) =>
      api.put<ResourceDetail>(`/api/v1/resources/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: resourceKeys.lists() })
      qc.invalidateQueries({ queryKey: resourceKeys.detail(id) })
    },
  })
}

export function useDeleteResource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/api/v1/resources/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: resourceKeys.lists() })
    },
  })
}

export function useTestResource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.post<TestConnectionResult>(`/api/v1/resources/${id}/test`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: resourceKeys.detail(id) })
      qc.invalidateQueries({ queryKey: resourceKeys.lists() })
    },
  })
}
