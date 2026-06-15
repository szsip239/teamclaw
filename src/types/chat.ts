import type { AgentCategory } from './agent'
import type { KbCategory } from './knowledge-base'

/** Knowledge base source reference — shown under assistant messages */
export interface KbSourceRef {
  kbId: string
  kbName: string
  category: KbCategory
  text: string
  score: number
  /** Backing document (RAG service kb_id+doc_id pair, mapped to KnowledgeDocument.id here) */
  docRowId?: string
  docName?: string
  /** 1-based page number for PDF sources; absent for Excel/other */
  pageIndex?: number
  /** "text" (PDF) | "table" (Excel) — controls preview affordance */
  sourceType?: 'text' | 'table'
}

export interface ChatAgentInfo {
  instanceId: string
  instanceName: string
  agentId: string
  agentName: string
  status: string
  model?: string
  category?: AgentCategory
  hasContainer?: boolean
}

// Structured content block — represents a single piece of content in a message
export interface ChatContentBlock {
  type: 'text' | 'image'
  text?: string // type=text
  imageUrl?: string // type=image (base64 data URL or http URL)
  imageId?: string // pre-computed hash for image endpoint lookup
  mimeType?: string // image/png, image/jpeg, etc.
  alt?: string // image description
}

// User-uploaded attachment metadata (for UI preview)
export interface ChatAttachment {
  name: string
  mimeType: string
  size: number
  dataUrl: string // base64 data URL for local preview
}

export interface ChatSessionResponse {
  id: string
  sessionId: string // OpenClaw session key (e.g. "agent:<agentId>:tc:<userId>")
  instanceId: string
  instanceName: string
  agentId: string
  agentName?: string
  title: string | null
  lastMessageAt: string | null
  messageCount: number
  isActive: boolean
  createdAt: string
}

export interface ChatSnapshotBatch {
  batchId: string
  createdAt: string
  messages: ChatMessage[]
}

export interface ChatHistoryResponse {
  snapshots: ChatSnapshotBatch[]
  currentMessages: ChatMessage[]
  isActive: boolean
  connectionStatus?: 'ok' | 'unreachable' | 'session-lost'
  isRunning?: boolean
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string // plain text (backward compatible)
  contentBlocks?: ChatContentBlock[] // structured content blocks (images, etc.)
  thinking?: string
  toolCalls?: ChatToolCall[]
  messageSeq?: number
  stopReason?: string
  isFinal?: boolean
  error?: string
  createdAt: string
  attachments?: ChatAttachment[] // user-uploaded attachments
  kbSources?: KbSourceRef[] // KB source references for this message
}

export interface ChatToolCall {
  toolName: string
  toolInput: unknown
  toolOutput?: unknown
}

// SSE event types from /api/v1/chat/send
export interface ChatStreamTextEvent {
  type: 'text'
  content: string
}

export interface ChatStreamThinkingEvent {
  type: 'thinking'
  content: string
}

export interface ChatStreamToolCallEvent {
  type: 'tool_call'
  toolName: string
  toolInput: unknown
}

export interface ChatStreamToolResultEvent {
  type: 'tool_result'
  toolName: string
  toolOutput: unknown
}

export interface ChatStreamErrorEvent {
  type: 'error'
  error: string
}

export interface ChatStreamImageEvent {
  type: 'image'
  imageUrl: string // base64 data URL or remote URL
  mimeType?: string
  alt?: string
}

export interface ChatStreamDoneEvent {
  type: 'done'
}

export interface ChatStreamSessionEvent {
  type: 'session'
  sessionId: string
}

export interface ChatStreamConfirmedEvent {
  type: 'confirmed'
}

export interface ChatStreamKbSourcesEvent {
  type: 'kb_sources'
  sources: KbSourceRef[]
}

export type ChatStreamEvent =
  | ChatStreamTextEvent
  | ChatStreamThinkingEvent
  | ChatStreamToolCallEvent
  | ChatStreamToolResultEvent
  | ChatStreamErrorEvent
  | ChatStreamImageEvent
  | ChatStreamDoneEvent
  | ChatStreamSessionEvent
  | ChatStreamConfirmedEvent
  | ChatStreamKbSourcesEvent
