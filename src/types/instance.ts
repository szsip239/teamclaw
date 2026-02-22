import type { InstanceStatus } from '@/generated/prisma'

// ─── API Response Types ──────────────────────────────────────────────

export interface InstanceResponse {
  id: string
  name: string
  description: string | null
  gatewayUrl: string
  // gatewayToken is NEVER returned
  containerId: string | null
  containerName: string | null
  imageName: string
  dockerConfig: DockerConfig | null
  status: InstanceStatus
  lastHealthCheck: string | null
  healthData: Record<string, unknown> | null
  version: string | null
  createdById: string
  createdAt: string
  updatedAt: string
}

export interface InstanceListResponse {
  instances: InstanceResponse[]
  total: number
  page: number
  pageSize: number
}

export interface InstanceHealthResponse {
  status: string
  uptime?: number
  version?: string
  agents?: { id: string; status: string }[]
  sessions?: { count: number } | number
  checkedAt: string
}

export interface InstanceLogsResponse {
  logs: string
  containerId: string
}

export interface InstanceConfigResponse {
  config: Record<string, unknown>
  containerId: string
}

// ─── Docker Configuration ────────────────────────────────────────────

export interface DockerConfig {
  imageName?: string
  env?: Record<string, string>
  portBindings?: Record<string, string>
  volumes?: Record<string, string>
  restartPolicy?: 'no' | 'always' | 'unless-stopped' | 'on-failure'
  memoryLimit?: number // bytes
}

// ─── Model Provider ──────────────────────────────────────────────────

export interface ModelProviderInput {
  name: string
  apiKey: string
  api?: string
  baseUrl?: string
}

// ─── API Request Types ───────────────────────────────────────────────

export interface CreateInstanceInput {
  name: string
  description?: string
  mode?: 'docker' | 'external'
  gatewayUrl?: string
  gatewayToken?: string
  docker?: DockerConfig
  modelProvider?: ModelProviderInput
  defaultAgentId?: string
}

export interface UpdateInstanceInput {
  name?: string
  description?: string
  gatewayUrl?: string
  gatewayToken?: string
  docker?: DockerConfig
}

export interface UpdateInstanceConfigInput {
  config: Record<string, unknown>
}
