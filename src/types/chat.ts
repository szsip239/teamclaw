import type { AgentCategory } from './agent'

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
  text?: string           // type=text
  imageUrl?: string       // type=image (base64 data URL or http URL)
  mimeType?: string       // image/png, image/jpeg, etc.
  alt?: string            // image description
}

// User-uploaded attachment metadata (for UI preview)
export interface ChatAttachment {
  name: string
  mimeType: string
  size: number
  dataUrl: string    // base64 data URL for local preview
}

export interface ChatSessionResponse {
  id: string
  sessionId: string  // OpenClaw session key (e.g. "agent:<agentId>:tc:<userId>")
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
  connectionStatus?: 'ok' | 'unreachable'
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string                    // plain text (backward compatible)
  contentBlocks?: ChatContentBlock[] // structured content blocks (images, etc.)
  thinking?: string
  toolCalls?: ChatToolCall[]
  error?: string
  createdAt: string
  attachments?: ChatAttachment[]     // user-uploaded attachments
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
  imageUrl: string   // base64 data URL or remote URL
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

export type ChatStreamEvent =
  | ChatStreamTextEvent
  | ChatStreamThinkingEvent
  | ChatStreamToolCallEvent
  | ChatStreamToolResultEvent
  | ChatStreamErrorEvent
  | ChatStreamImageEvent
  | ChatStreamDoneEvent
  | ChatStreamSessionEvent
