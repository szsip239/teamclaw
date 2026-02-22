"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { UserListResponse, UserResponse } from "@/types/user"
import type { CreateUserInput, UpdateUserInput, ResetPasswordInput } from "@/lib/validations/user"

// ── Query Key Factory ───────────────────────────────────────────────

export const userKeys = {
  all: ["users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (params: Record<string, string | undefined>) =>
    [...userKeys.lists(), params] as const,
  details: () => [...userKeys.all, "detail"] as const,
  detail: (id: string) => [...userKeys.details(), id] as const,
}

// ── List ────────────────────────────────────────────────────────────

export function useUsers(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  departmentId?: string
}) {
  const searchParams = new URLSearchParams()
  if (params?.page) searchParams.set("page", String(params.page))
  if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize))
  if (params?.search) searchParams.set("search", params.search)
  if (params?.status) searchParams.set("status", params.status)
  if (params?.departmentId) searchParams.set("departmentId", params.departmentId)

  const qs = searchParams.toString()
  const endpoint = `/api/v1/users${qs ? `?${qs}` : ""}`

  return useQuery({
    queryKey: userKeys.list({
      page: params?.page?.toString(),
      search: params?.search,
      status: params?.status,
      departmentId: params?.departmentId,
    }),
    queryFn: () => api.get<UserListResponse>(endpoint),
    refetchInterval: 30_000,
  })
}

// ── Detail ──────────────────────────────────────────────────────────

export function useUser(id: string | null) {
  return useQuery({
    queryKey: userKeys.detail(id!),
    queryFn: () => api.get<{ user: UserResponse }>(`/api/v1/users/${id}`),
    enabled: !!id,
  })
}

// ── Mutations ───────────────────────────────────────────────────────

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserInput) =>
      api.post<{ user: UserResponse }>("/api/v1/users", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() })
    },
  })
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateUserInput) =>
      api.put<{ user: UserResponse }>(`/api/v1/users/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() })
      qc.invalidateQueries({ queryKey: userKeys.detail(id) })
    },
  })
}

export function useDeleteUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: userKeys.lists() })
    },
  })
}

export function useResetUserPassword(id: string) {
  return useMutation({
    mutationFn: (data: ResetPasswordInput) =>
      api.post<{ message: string }>(`/api/v1/users/${id}/reset-password`, data),
  })
}
