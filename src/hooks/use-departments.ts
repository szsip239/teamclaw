"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type {
  DepartmentResponse,
  DepartmentDetailResponse,
} from "@/types/department"
import type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@/lib/validations/department"

// ─── Query Key Factory ───────────────────────────────────────────────

export const departmentKeys = {
  all: ["departments"] as const,
  lists: () => [...departmentKeys.all, "list"] as const,
  list: () => [...departmentKeys.lists()] as const,
  details: () => [...departmentKeys.all, "detail"] as const,
  detail: (id: string) => [...departmentKeys.details(), id] as const,
}

// ─── List ────────────────────────────────────────────────────────────

export function useDepartments() {
  return useQuery({
    queryKey: departmentKeys.list(),
    queryFn: () =>
      api.get<{ departments: DepartmentResponse[] }>("/api/v1/departments"),
  })
}

// ─── Detail ──────────────────────────────────────────────────────────

export function useDepartment(id: string | null) {
  return useQuery({
    queryKey: departmentKeys.detail(id!),
    queryFn: () =>
      api.get<{ department: DepartmentDetailResponse }>(
        `/api/v1/departments/${id}`,
      ),
    enabled: !!id,
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateDepartmentInput) =>
      api.post<{ department: DepartmentResponse }>("/api/v1/departments", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: departmentKeys.lists() })
    },
  })
}

export function useUpdateDepartment(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateDepartmentInput) =>
      api.put<{ department: DepartmentResponse }>(
        `/api/v1/departments/${id}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: departmentKeys.lists() })
      qc.invalidateQueries({ queryKey: departmentKeys.detail(id) })
    },
  })
}

export function useDeleteDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/departments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: departmentKeys.lists() })
    },
  })
}
