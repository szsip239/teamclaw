"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useAuthStore } from "@/stores/auth-store"
import type { ChatAgentInfo, ChatSessionResponse, ChatHistoryResponse } from "@/types/chat"

// ─── Query Key Factory ───────────────────────────────────────────────

export const chatKeys = {
  all: ["chat"] as const,
  agents: () => [...chatKeys.all, "agents"] as const,
  sessions: () => [...chatKeys.all, "sessions"] as const,
  history: (sessionId: string | null) =>
    [...chatKeys.all, "history", sessionId] as const,
}

// ─── Agents ──────────────────────────────────────────────────────────

export function useChatAgents() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: chatKeys.agents(),
    queryFn: () =>
      api.get<{ agents: ChatAgentInfo[] }>("/api/v1/chat/agents"),
    enabled: !!user,
    select: (data) => data.agents,
  })
}

// ─── Sessions ────────────────────────────────────────────────────────

export function useChatSessions() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: chatKeys.sessions(),
    queryFn: () =>
      api.get<{ sessions: ChatSessionResponse[] }>("/api/v1/chat/sessions"),
    enabled: !!user,
    select: (data) => data.sessions,
  })
}

// ─── History ────────────────────────────────────────────────────────

export function useChatHistory(sessionId: string | null) {
  return useQuery({
    queryKey: chatKeys.history(sessionId),
    queryFn: () =>
      api.get<ChatHistoryResponse>(
        `/api/v1/chat/sessions/${sessionId}/history`,
      ),
    enabled: !!sessionId,
  })
}

// ─── Delete Session ──────────────────────────────────────────────────

export function useDeleteChatSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/chat/sessions/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.sessions() })
    },
  })
}

// ─── Clear Context ──────────────────────────────────────────────────

export function useClearContext() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post(`/api/v1/chat/sessions/${sessionId}/clear-context`),
    onSuccess: (_data, sessionId) => {
      qc.invalidateQueries({ queryKey: chatKeys.history(sessionId) })
      qc.invalidateQueries({ queryKey: chatKeys.sessions() })
    },
  })
}

// ─── New Conversation ───────────────────────────────────────────────

export function useNewConversation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { instanceId: string; agentId: string }) =>
      api.post<{ session: ChatSessionResponse }>(
        "/api/v1/chat/conversations/new",
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.sessions() })
    },
  })
}
