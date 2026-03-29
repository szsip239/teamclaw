"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { RagConfig } from "@/types/settings"

export const settingsKeys = {
  rag: ["settings", "rag"] as const,
}

export function useRagSettings() {
  return useQuery({
    queryKey: settingsKeys.rag,
    queryFn: () => api.get<Partial<RagConfig>>("/api/v1/settings/rag"),
  })
}

export function useSaveRagSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<RagConfig>) =>
      api.put<{ status: string }>("/api/v1/settings/rag", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.rag })
    },
  })
}
