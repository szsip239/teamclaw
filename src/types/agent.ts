import type {
  AgentConfigEntry,
  AgentDefaults,
  AgentModelConfig,
  AgentSandboxConfig,
  WorkspaceFileEntry,
} from './gateway'

// ─── Agent Category ─────────────────────────────────────────────────

export type AgentCategory = 'DEFAULT' | 'DEPARTMENT' | 'PERSONAL'

// ─── API Response Types ──────────────────────────────────────────────

/** Agent overview for list page */
export interface AgentOverview {
  id: string               // gateway agent ID
  instanceId: string
  instanceName: string
  name: string             // display name from gateway, fallback to id
  workspace: string
  isDefault: boolean
  models?: AgentModelConfig
  sandbox?: AgentSandboxConfig
  category?: AgentCategory
  departmentName?: string | null
  ownerName?: string | null
}

/** Agent detail with full config */
export interface AgentDetail extends AgentOverview {
  config: AgentConfigEntry
  defaults: AgentDefaults
  workspaceFiles: WorkspaceFileEntry[]
}

/** Agents list response */
export interface AgentListResponse {
  agents: AgentOverview[]
  instanceCount: number
  errors?: { instanceId: string; error: string }[]
}

/** File content response */
export interface FileContentResponse {
  path: string
  content: string
}

/** Agent defaults response */
export interface AgentDefaultsResponse {
  instanceId: string
  defaults: AgentDefaults
  hash: string             // config hash for subsequent patches
}
