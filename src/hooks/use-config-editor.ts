"use client"

import {
  useQuery,
  useMutation,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type { ConfigEditorInitResponse, ConfigPatchInput } from "@/types/config-editor"

// ─── Query Key Factory ──────────────────────────────────────────────

export const configEditorKeys = {
  all: ["config-editor"] as const,
  init: (instanceId: string) =>
    [...configEditorKeys.all, "init", instanceId] as const,
}

// ─── Combined schema + config (single call) ────────────────────────

export function useConfigEditorInit(instanceId: string) {
  return useQuery({
    queryKey: configEditorKeys.init(instanceId),
    queryFn: () =>
      api.get<ConfigEditorInitResponse>(
        `/api/v1/instances/${instanceId}/schema`,
      ),
    staleTime: 5 * 60 * 1000,
    enabled: !!instanceId,
  })
}

// ─── Patch Mutation ─────────────────────────────────────────────────

export function usePatchConfig(instanceId: string) {
  return useMutation({
    mutationFn: (data: ConfigPatchInput) =>
      api.post<{ status: string; hash: string; config: Record<string, unknown> }>(
        `/api/v1/instances/${instanceId}/config-patch`,
        data,
      ),
    // No onSuccess invalidation — applyPatchResult() already updates store
    // with fresh config+hash from patch response. Invalidation would trigger
    // re-initialization, resetting selectedModule to first module.
  })
}
