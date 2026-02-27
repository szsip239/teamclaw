"use client"

import { useEffect, useRef, useCallback } from "react"
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
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
    // Don't retry on client errors (400/403/404) — instance has no container
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        return false
      }
      return failureCount < 3
    },
  })
}

// ─── File Watch (SSE) ───────────────────────────────────────────────

const MAX_BACKOFF_MS = 30_000

export function useFileWatch(sessionId: string | null) {
  const qc = useQueryClient()
  const backoffRef = useRef(1_000)

  const invalidateFiles = useCallback(() => {
    qc.invalidateQueries({ queryKey: sessionFileKeys.lists() })
  }, [qc])

  useEffect(() => {
    if (!sessionId) return

    let aborted = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    backoffRef.current = 1_000

    async function connect() {
      if (aborted) return
      let permanentFailure = false
      try {
        const res = await fetch(
          `/api/v1/chat/sessions/${sessionId}/files/watch`,
          { credentials: "include" },
        )
        if (!res.ok || !res.body) {
          // Don't retry on client errors (400/403/404) — these won't resolve on retry
          if (res.status >= 400 && res.status < 500) {
            permanentFailure = true
          }
          return
        }

        // Reset backoff on successful connection
        backoffRef.current = 1_000

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (!aborted) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE lines
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            try {
              const evt = JSON.parse(line.slice(6)) as { type: string }
              if (evt.type === "files-changed") {
                invalidateFiles()
              }
            } catch {
              // Ignore malformed lines
            }
          }
        }
      } catch {
        // Network error — will reconnect below
      }

      // Reconnect with exponential backoff — but only for transient errors
      if (!aborted && !permanentFailure) {
        reconnectTimer = setTimeout(() => {
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
          connect()
        }, backoffRef.current)
      }
    }

    connect()

    return () => {
      aborted = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }, [sessionId, invalidateFiles])
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
