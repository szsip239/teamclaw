"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { chatKeys } from "./use-chat"
import type { AgentListResponse, AgentDetail, AgentDefaultsResponse, FileContentResponse } from "@/types/agent"
import type { WorkspaceFileEntry } from "@/types/gateway"
import type { CreateAgentInput, UpdateAgentConfigInput, UpdateAgentDefaultsInput, CloneAgentInput, ClassifyAgentInput } from "@/lib/validations/agent"

// ─── Query Key Factory ───────────────────────────────────────────────

export const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  list: (instanceId?: string) => [...agentKeys.lists(), { instanceId }] as const,
  details: () => [...agentKeys.all, "detail"] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
  defaults: (instanceId: string) => [...agentKeys.all, "defaults", instanceId] as const,
  files: (id: string, dir?: string) => [...agentKeys.all, "files", id, { dir }] as const,
  fileContent: (id: string, path: string) => [...agentKeys.all, "fileContent", id, path] as const,
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** URL-encode composite agent ID (instanceId:agentId) */
function encodeAgentId(id: string): string {
  return encodeURIComponent(id)
}

// ─── List ────────────────────────────────────────────────────────────

export function useAgents(instanceId?: string) {
  const qs = instanceId ? `?instanceId=${encodeURIComponent(instanceId)}` : ""
  return useQuery({
    queryKey: agentKeys.list(instanceId),
    queryFn: () => api.get<AgentListResponse>(`/api/v1/agents${qs}`),
  })
}

// ─── Detail ──────────────────────────────────────────────────────────

export function useAgent(id: string | null) {
  return useQuery({
    queryKey: agentKeys.detail(id!),
    queryFn: () => api.get<AgentDetail>(`/api/v1/agents/${encodeAgentId(id!)}`),
    enabled: !!id,
  })
}

// ─── Agent Defaults ──────────────────────────────────────────────────

export function useAgentDefaults(instanceId: string | null) {
  return useQuery({
    queryKey: agentKeys.defaults(instanceId!),
    queryFn: () =>
      api.get<AgentDefaultsResponse>(
        `/api/v1/instances/${encodeURIComponent(instanceId!)}/agent-defaults`,
      ),
    enabled: !!instanceId,
  })
}

// ─── Workspace Files ─────────────────────────────────────────────────

export function useAgentFiles(id: string | null, dir?: string) {
  const qs = dir ? `?dir=${encodeURIComponent(dir)}` : ""
  return useQuery({
    queryKey: agentKeys.files(id!, dir),
    queryFn: () =>
      api.get<{ files: WorkspaceFileEntry[]; workspace: string; dir: string }>(
        `/api/v1/agents/${encodeAgentId(id!)}/files${qs}`,
      ),
    enabled: !!id,
  })
}

// ─── File Content ────────────────────────────────────────────────────

export function useAgentFileContent(id: string | null, path: string | null) {
  return useQuery({
    queryKey: agentKeys.fileContent(id!, path!),
    queryFn: () =>
      api.get<FileContentResponse>(
        `/api/v1/agents/${encodeAgentId(id!)}/files/${path}`,
      ),
    enabled: !!id && !!path,
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAgentInput) =>
      api.post<{ status: string; agentId: string }>("/api/v1/agents", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
      qc.invalidateQueries({ queryKey: chatKeys.agents() })
    },
  })
}

export function useUpdateAgentConfig(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAgentConfigInput) =>
      api.put<{ status: string; agentId: string }>(
        `/api/v1/agents/${encodeAgentId(id)}`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
      qc.invalidateQueries({ queryKey: agentKeys.detail(id) })
      qc.invalidateQueries({ queryKey: chatKeys.agents() })
    },
  })
}

export function useDeleteAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string; agentId: string }>(
        `/api/v1/agents/${encodeAgentId(id)}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
      qc.invalidateQueries({ queryKey: chatKeys.agents() })
    },
  })
}

export function useUpdateAgentDefaults(instanceId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateAgentDefaultsInput) =>
      api.put<{ status: string; instanceId: string }>(
        `/api/v1/instances/${encodeURIComponent(instanceId)}/agent-defaults`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.defaults(instanceId) })
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
    },
  })
}

export function useCloneAgent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CloneAgentInput) =>
      api.post<{ id: string; agentId: string; instanceId: string; filesCopied: boolean }>(
        "/api/v1/agents/clone",
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
      qc.invalidateQueries({ queryKey: chatKeys.agents() })
    },
  })
}

export function useClassifyAgent(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: ClassifyAgentInput) =>
      api.patch<{ status: string; category: string }>(
        `/api/v1/agents/${encodeAgentId(id)}/classify`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.lists() })
      qc.invalidateQueries({ queryKey: agentKeys.detail(id) })
      qc.invalidateQueries({ queryKey: chatKeys.agents() })
    },
  })
}

export function useSaveAgentFile(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.put<{ success: boolean; path: string }>(
        `/api/v1/agents/${encodeAgentId(id)}/files/${path}`,
        { content },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: agentKeys.files(id) })
    },
  })
}
