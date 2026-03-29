"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type {
  KnowledgeBaseListResponse,
  KnowledgeBaseDetail,
  KnowledgeDocumentInfo,
  IngestionJobStatus,
} from "@/types/knowledge-base"
import type { CreateKbInput, UpdateKbInput } from "@/lib/validations/knowledge-base"

// ─── Query Key Factory ───────────────────────────────────────────────

export const kbKeys = {
  all: ["knowledge-bases"] as const,
  lists: () => [...kbKeys.all, "list"] as const,
  list: (params?: Record<string, string>) =>
    [...kbKeys.lists(), params ?? {}] as const,
  details: () => [...kbKeys.all, "detail"] as const,
  detail: (id: string) => [...kbKeys.details(), id] as const,
  documents: (id: string) =>
    [...kbKeys.all, "documents", id] as const,
  job: (kbId: string, docId: string, jobId: string) =>
    [...kbKeys.all, "job", kbId, docId, jobId] as const,
}

// ─── List ────────────────────────────────────────────────────────────

export function useKnowledgeBases(params?: {
  scope?: string
  search?: string
}) {
  const qs = new URLSearchParams()
  if (params?.scope && params.scope !== "all")
    qs.set("scope", params.scope)
  if (params?.search) qs.set("search", params.search)

  const qsStr = qs.toString()
  return useQuery({
    queryKey: kbKeys.list(params as Record<string, string> | undefined),
    queryFn: () =>
      api.get<KnowledgeBaseListResponse>(
        `/api/v1/knowledge-bases${qsStr ? `?${qsStr}` : ""}`,
      ),
  })
}

// ─── Detail ──────────────────────────────────────────────────────────

export function useKnowledgeBase(id: string | null) {
  return useQuery({
    queryKey: kbKeys.detail(id!),
    queryFn: () => api.get<KnowledgeBaseDetail>(`/api/v1/knowledge-bases/${id}`),
    enabled: !!id,
  })
}

// ─── Documents ───────────────────────────────────────────────────────

export function useKbDocuments(id: string | null) {
  return useQuery({
    queryKey: kbKeys.documents(id!),
    queryFn: () =>
      api.get<{ documents: KnowledgeDocumentInfo[] }>(
        `/api/v1/knowledge-bases/${id}/documents`,
      ),
    enabled: !!id,
  })
}

// ─── Job Status (polling) ────────────────────────────────────────────

export function useJobStatus(kbId: string, docId: string, jobId: string | null) {
  return useQuery({
    queryKey: kbKeys.job(kbId, docId, jobId!),
    queryFn: () =>
      api.get<IngestionJobStatus>(
        `/api/v1/knowledge-bases/${kbId}/documents/${docId}/jobs/${jobId}`,
      ),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "completed" || status === "failed") return false
      return 2000 // Poll every 2s while processing
    },
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateKb() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateKbInput) =>
      api.post<{ id: string; name: string }>("/api/v1/knowledge-bases", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys.lists() })
    },
  })
}

export function useUpdateKb(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateKbInput) =>
      api.patch<{ id: string; name: string }>(`/api/v1/knowledge-bases/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys.lists() })
      qc.invalidateQueries({ queryKey: kbKeys.detail(id) })
    },
  })
}

export function useDeleteKb() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/api/v1/knowledge-bases/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys.lists() })
    },
  })
}

export function useUploadDocument(kbId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/v1/knowledge-bases/${kbId}/documents/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || "Upload failed")
      }
      return res.json() as Promise<{ id: string; docId: string; jobId: string }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys.detail(kbId) })
      qc.invalidateQueries({ queryKey: kbKeys.documents(kbId) })
    },
  })
}

export function useDeleteDocument(kbId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (docId: string) =>
      api.delete<{ status: string }>(`/api/v1/knowledge-bases/${kbId}/documents/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: kbKeys.detail(kbId) })
      qc.invalidateQueries({ queryKey: kbKeys.documents(kbId) })
      qc.invalidateQueries({ queryKey: kbKeys.lists() })
    },
  })
}
