"use client"

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import type {
  SkillListResponse,
  SkillDetail,
  SkillFileEntry,
  SkillInstallationInfo,
  ClawHubSearchResult,
} from "@/types/skill"
import type {
  CreateSkillInput,
  UpdateSkillInput,
  PublishVersionInput,
  InstallSkillInput,
  UninstallSkillInput,
} from "@/lib/validations/skill"

// ─── Query Key Factory ───────────────────────────────────────────────

export const skillKeys = {
  all: ["skills"] as const,
  lists: () => [...skillKeys.all, "list"] as const,
  list: (params?: Record<string, string>) =>
    [...skillKeys.lists(), params ?? {}] as const,
  details: () => [...skillKeys.all, "detail"] as const,
  detail: (id: string) => [...skillKeys.details(), id] as const,
  files: (id: string, dir?: string) =>
    [...skillKeys.all, "files", id, { dir }] as const,
  fileContent: (id: string, path: string) =>
    [...skillKeys.all, "fileContent", id, path] as const,
  installations: (id: string) =>
    [...skillKeys.all, "installations", id] as const,
  checkUpgrade: (id: string) =>
    [...skillKeys.all, "checkUpgrade", id] as const,
  checkClawHub: (id: string) =>
    [...skillKeys.all, "checkClawHub", id] as const,
}

// ─── List ────────────────────────────────────────────────────────────

export function useSkills(params?: {
  page?: number
  pageSize?: number
  category?: string
  source?: string
  tag?: string
  search?: string
}) {
  const qs = new URLSearchParams()
  if (params?.page) qs.set("page", String(params.page))
  if (params?.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params?.category && params.category !== "all")
    qs.set("category", params.category)
  if (params?.source && params.source !== "all")
    qs.set("source", params.source)
  if (params?.tag) qs.set("tag", params.tag)
  if (params?.search) qs.set("search", params.search)

  const qsStr = qs.toString()
  return useQuery({
    queryKey: skillKeys.list(params as Record<string, string> | undefined),
    queryFn: () =>
      api.get<SkillListResponse>(
        `/api/v1/skills${qsStr ? `?${qsStr}` : ""}`,
      ),
  })
}

// ─── Detail ──────────────────────────────────────────────────────────

export function useSkill(id: string | null) {
  return useQuery({
    queryKey: skillKeys.detail(id!),
    queryFn: () => api.get<SkillDetail>(`/api/v1/skills/${id}`),
    enabled: !!id,
  })
}

// ─── Files ───────────────────────────────────────────────────────────

export function useSkillFiles(id: string | null, dir?: string) {
  const qs = dir ? `?dir=${encodeURIComponent(dir)}` : ""
  return useQuery({
    queryKey: skillKeys.files(id!, dir),
    queryFn: () =>
      api.get<{ files: SkillFileEntry[] }>(
        `/api/v1/skills/${id}/files${qs}`,
      ),
    enabled: !!id,
  })
}

export function useSkillFileContent(id: string | null, path: string | null) {
  return useQuery({
    queryKey: skillKeys.fileContent(id!, path!),
    queryFn: () =>
      api.get<{ path: string; content: string }>(
        `/api/v1/skills/${id}/files/${path}`,
      ),
    enabled: !!id && !!path,
  })
}

// ─── Installations ───────────────────────────────────────────────────

export function useSkillInstallations(id: string | null) {
  return useQuery({
    queryKey: skillKeys.installations(id!),
    queryFn: () =>
      api.get<{ installations: SkillInstallationInfo[] }>(
        `/api/v1/skills/${id}/installations`,
      ),
    enabled: !!id,
  })
}

export function useSkillCheckUpgrade(id: string | null) {
  return useQuery({
    queryKey: skillKeys.checkUpgrade(id!),
    queryFn: () =>
      api.get<{
        currentVersion: string
        totalInstallations: number
        totalOutdated: number
        upgradeableCount: number
        outdated: {
          id: string
          instanceId: string
          instanceName: string
          instanceStatus: string
          agentId: string
          installedVersion: string
          installPath: string
          installedByName: string
          installedAt: string
        }[]
      }>(`/api/v1/skills/${id}/check-upgrade`),
    enabled: !!id,
  })
}

// ─── ClawHub Update Check ───────────────────────────────────────────

export function useCheckClawHubUpdate(id: string | null, source: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () =>
      api.get<{
        hasUpdate: boolean
        currentVersion: string
        latestVersion?: string
        latestDescription?: string
        clawhubUrl?: string
        error?: string
      }>(`/api/v1/skills/${id}/check-clawhub`),
    onSuccess: () => {
      // Refetch detail since check-clawhub may backfill clawhubSlug/homepage
      if (id) qc.invalidateQueries({ queryKey: skillKeys.detail(id) })
    },
  })
}

// ─── Mutations ───────────────────────────────────────────────────────

export function useCreateSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateSkillInput) =>
      api.post<{ id: string; slug: string }>("/api/v1/skills", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
    },
  })
}

export function useUpdateSkill(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UpdateSkillInput & { departmentIds?: string[] }) =>
      api.put<{ status: string }>(`/api/v1/skills/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
      qc.invalidateQueries({ queryKey: skillKeys.detail(id) })
    },
  })
}

export function useDeleteSkill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ status: string }>(`/api/v1/skills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
    },
  })
}

export function usePublishSkillVersion(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PublishVersionInput) =>
      api.post<{ status: string; version: string }>(
        `/api/v1/skills/${id}/publish`,
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.detail(id) })
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
    },
  })
}

export function useInstallSkill(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: InstallSkillInput) =>
      api.post<{ status: string }>(`/api/v1/skills/${id}/install`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.installations(id) })
      qc.invalidateQueries({ queryKey: skillKeys.checkUpgrade(id) })
      qc.invalidateQueries({ queryKey: skillKeys.detail(id) })
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
    },
  })
}

export function useUninstallSkill(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UninstallSkillInput) =>
      api.post<{ status: string }>(`/api/v1/skills/${id}/uninstall`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.installations(id) })
      qc.invalidateQueries({ queryKey: skillKeys.detail(id) })
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
    },
  })
}

export function useSaveSkillFile(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.put<{ success: boolean }>(
        `/api/v1/skills/${id}/files/${path}`,
        { content },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.files(id) })
    },
  })
}

export function useDeleteSkillFile(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (path: string) =>
      api.delete<{ status: string }>(
        `/api/v1/skills/${id}/files/${path}`,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.files(id) })
    },
  })
}

export function useClawHubSearch() {
  return useMutation({
    mutationFn: (query: string) =>
      api.post<{ results: ClawHubSearchResult[] }>(
        "/api/v1/skills/clawhub/search",
        { query },
      ),
  })
}

export function useClawHubPull() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { slug: string; category?: string; departmentIds?: string[] }) =>
      api.post<{ id: string; slug: string }>(
        "/api/v1/skills/clawhub/pull",
        data,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: skillKeys.lists() })
    },
  })
}
