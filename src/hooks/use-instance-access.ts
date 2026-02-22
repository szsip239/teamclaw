"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { departmentKeys } from "./use-departments"
import type { GrantAccessInput, UpdateAccessInput } from "@/lib/validations/instance-access"

// ─── Types ───────────────────────────────────────────────────────────

export interface InstanceAccessGrant {
  id: string
  departmentId: string
  departmentName: string
  instanceId: string
  instanceName: string
  instanceStatus: string
  agentIds: string[] | null
  grantedByName: string
  createdAt: string
  updatedAt: string
}

// ─── Query Key Factory ───────────────────────────────────────────────

export const instanceAccessKeys = {
  all: ["instance-access"] as const,
  lists: () => [...instanceAccessKeys.all, "list"] as const,
  list: (params?: { departmentId?: string; instanceId?: string }) =>
    [...instanceAccessKeys.lists(), params ?? {}] as const,
}

// ─── List ────────────────────────────────────────────────────────────

export function useInstanceAccessList(params?: {
  departmentId?: string
  instanceId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.departmentId)
    searchParams.set("departmentId", params.departmentId)
  if (params?.instanceId) searchParams.set("instanceId", params.instanceId)

  const qs = searchParams.toString()
  const endpoint = `/api/v1/instance-access${qs ? `?${qs}` : ""}`

  return useQuery({
    queryKey: instanceAccessKeys.list(params),
    queryFn: () => api.get<{ grants: InstanceAccessGrant[] }>(endpoint),
    enabled: !!(params?.departmentId || params?.instanceId),
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useGrantAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GrantAccessInput) =>
      api.post<{ grant: InstanceAccessGrant }>(
        "/api/v1/instance-access",
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceAccessKeys.lists() })
      qc.invalidateQueries({ queryKey: departmentKeys.details() })
    },
  })
}

export function useUpdateAccess(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAccessInput) =>
      api.put<{ grant: InstanceAccessGrant }>(
        `/api/v1/instance-access/${id}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceAccessKeys.lists() })
      qc.invalidateQueries({ queryKey: departmentKeys.details() })
    },
  })
}

export function useRevokeAccess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/instance-access/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: instanceAccessKeys.lists() })
      qc.invalidateQueries({ queryKey: departmentKeys.details() })
    },
  })
}
