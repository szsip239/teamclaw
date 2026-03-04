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

/**
 * Agent overview for list/management page.
 * Returned by GET /api/v1/agents (Go backend — local metadata registry).
 * Optional fields (workspace, isDefault, models, sandbox) are not available
 * from metadata alone; they are populated by gateway enrichment when connected.
 */
export interface AgentOverview {
  id: string               // DB record ID (CUID)
  instanceId: string
  instanceName: string
  agentId: string          // agent ID within OpenClaw instance
  name: string             // display name; falls back to agentId
  category: AgentCategory
  departmentId?: string | null
  departmentName?: string | null
  ownerId?: string | null
  ownerName?: string | null
  createdById?: string
  createdByName?: string
  createdAt?: string
  updatedAt?: string
  // Optional gateway-enriched fields (present when gateway is connected)
  workspace?: string
  isDefault?: boolean
  models?: AgentModelConfig
  sandbox?: AgentSandboxConfig
}

/** Agent detail with full config (from gateway) */
export interface AgentDetail extends AgentOverview {
  config?: AgentConfigEntry
  defaults?: AgentDefaults
  workspaceFiles?: WorkspaceFileEntry[]
}

/** Agents list response (paginated, from Go backend metadata registry) */
export interface AgentListResponse {
  agents: AgentOverview[]
  total: number
  page: number
  pageSize: number
  // Kept for backward compatibility with components that check these
  instanceCount?: number
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
