"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { SessionFileListResponse } from "@/types/session-files"

// ─── Query Key Factory ───────────────────────────────────────────────

export const sessionFileKeys = {
  all: ["session-files"] as const,
  lists: () => [...sessionFileKeys.all, "list"] as const,
  list: (sessionId: string, zone: string, dir?: string) =>
    [...sessionFileKeys.lists(), sessionId, zone, dir ?? ""] as const,
}

// ─── List Files ──────────────────────────────────────────────────────

export function useSessionFiles(
  sessionId: string | null,
  zone: "input" | "output",
  dir?: string,
) {
  const params = new URLSearchParams({ zone })
  if (dir) params.set("dir", dir)

  return useQuery({
    queryKey: sessionFileKeys.list(sessionId!, zone, dir),
    queryFn: () =>
      api.get<SessionFileListResponse>(
        `/api/v1/chat/sessions/${sessionId}/files?${params}`,
      ),
    enabled: !!sessionId,
    refetchInterval: 30_000,
  })
}

// ─── Upload File ─────────────────────────────────────────────────────

export function useUploadSessionFile(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ file, dir }: { file: File; dir?: string }) => {
      const formData = new FormData()
      formData.append("file", file)
      if (dir) formData.append("dir", dir)

      const res = await fetch(
        `/api/v1/chat/sessions/${sessionId}/files/upload`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(
          (data as { error?: string } | null)?.error || "Upload failed",
        )
      }
      return res.json() as Promise<{ success: boolean }>
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionFileKeys.lists() })
    },
  })
}

// ─── Delete File ─────────────────────────────────────────────────────

export function useDeleteSessionFile(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (filePath: string) => {
      await api.delete(`/api/v1/chat/sessions/${sessionId}/files/${filePath}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionFileKeys.lists() })
    },
  })
}

// ─── Create Folder ───────────────────────────────────────────────────

export function useMkdirSession(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dir: string) => {
      await api.post(`/api/v1/chat/sessions/${sessionId}/files/mkdir`, { dir })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionFileKeys.lists() })
    },
  })
}

// ─── Move File ───────────────────────────────────────────────────────

export function useMoveSessionFile(sessionId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      source,
      target,
    }: {
      source: string
      target: string
    }) => {
      await api.post(`/api/v1/chat/sessions/${sessionId}/files/move`, {
        source,
        target,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sessionFileKeys.lists() })
    },
  })
}
