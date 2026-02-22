// ─── Gateway Wire Protocol ───────────────────────────────────────────

export interface GatewayRequest {
  type: 'req'
  id: string
  method: string
  params?: Record<string, unknown>
}

export interface GatewayResponse {
  type: 'res'
  id: string
  ok: boolean
  payload?: Record<string, unknown>
  error?: { code: string; message: string }
}

export interface GatewayEvent {
  type: 'event'
  event: string
  payload?: unknown
  seq?: number
  stateVersion?: { presence: number; health: number }
}

export type GatewayMessage = GatewayRequest | GatewayResponse | GatewayEvent

// ─── Chat Event Variants ─────────────────────────────────────────────

export interface ChatTextEvent {
  type: 'text'
  content: string
}

export interface ChatToolCallEvent {
  type: 'tool_call'
  toolName: string
  toolInput: unknown
}

export interface ChatToolResultEvent {
  type: 'tool_result'
  toolName: string
  toolOutput: unknown
}

export interface ChatThinkingEvent {
  type: 'thinking'
  content: string
}

export interface ChatErrorEvent {
  type: 'error'
  error: string
}

export interface ChatDoneEvent {
  type: 'done'
}

export type ChatEvent =
  | ChatTextEvent
  | ChatToolCallEvent
  | ChatToolResultEvent
  | ChatThinkingEvent
  | ChatErrorEvent
  | ChatDoneEvent

// ─── Agent Configuration (openclaw.json structure) ──────────────────

export interface AgentModelConfig {
  primary?: string
  list?: string[]
  thinking?: 'off' | 'low' | 'medium' | 'high'
}

export interface AgentSandboxConfig {
  mode?: 'off' | 'non-main' | 'all'
  scope?: 'session' | 'agent' | 'shared'
  workspaceAccess?: 'rw' | 'ro' | 'none'
  setupCommand?: string
  docker?: { image?: string; memory?: string; cpus?: string }
}

export interface AgentToolsConfig {
  allow?: string[]
  deny?: string[]
  elevated?: { allowFrom?: string[] }
  subagents?: { tools?: { deny?: string[] } }
}

export interface AgentSubagentsConfig {
  model?: string
  thinking?: 'off' | 'low' | 'medium' | 'high'
  maxConcurrent?: number
  archiveAfterMinutes?: number
}

export interface AgentSessionConfig {
  dmScope?: 'main' | 'per-peer' | 'per-channel-peer' | 'per-account-channel-peer'
  reset?: { mode?: string; hour?: number; idleAfterMinutes?: number }
}

/** agents.defaults — shared default config for all agents */
export interface AgentDefaults {
  models?: AgentModelConfig
  sandbox?: AgentSandboxConfig
  tools?: AgentToolsConfig
  subagents?: AgentSubagentsConfig
  session?: AgentSessionConfig
  bootstrapMaxChars?: number
}

/** agents.list[] entry — per-agent config */
export interface AgentConfigEntry {
  id: string
  workspace?: string
  agentDir?: string
  profile?: string
  default?: boolean
  models?: AgentModelConfig
  sandbox?: AgentSandboxConfig
  tools?: AgentToolsConfig
  subagents?: AgentSubagentsConfig
  session?: AgentSessionConfig
  bindings?: Array<Record<string, string>>
  [key: string]: unknown  // allow extra fields from openclaw.json
}

/** config.get response */
export interface ConfigGetResult {
  raw: string
  hash: string
  config: Record<string, unknown>
}

/** Workspace file entry */
export interface WorkspaceFileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
}

// ─── Domain Models ───────────────────────────────────────────────────

export interface GatewayAgent {
  id: string
  name: string
  status: string
  workspace: string
  model?: string
}

export interface GatewaySession {
  id: string
  agentId: string
  status: string
  messageCount: number
  createdAt: string
  lastMessageAt?: string
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptime: number
  version?: string
  agents?: { id: string; status: string }[]
}

export interface ChatOptions {
  skills?: string[]
  model?: string
  attachments?: { fileName: string; mimeType: string; content: string }[]
}

// ─── Chat History (from chat.history API) ───────────────────────────

export interface ChatHistoryMessage {
  role: 'user' | 'assistant' | 'toolResult' | 'command'
  content: string | Array<{
    type: string
    text?: string
    thinking?: string
    // Image block fields (OpenClaw returns images in content blocks)
    source?: { type: string; media_type?: string; data?: string }
    url?: string
  }>
  toolCallId?: string
  toolName?: string
  isError?: boolean
  stopReason?: string
  errorMessage?: string
}

export interface ChatHistoryResult {
  sessionId: string
  messages: ChatHistoryMessage[]
}

// ─── Config Schema (from config.schema RPC) ────────────────────────

export interface UiHint {
  label?: string
  help?: string
  placeholder?: string
  sensitive?: boolean
  order?: number
}

export interface ConfigSchemaResult {
  schema: Record<string, unknown>
  uiHints: Record<string, UiHint>
  version?: string
}
