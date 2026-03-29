export type KbScope = 'GLOBAL' | 'DEPARTMENT' | 'PERSONAL'
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

export interface KnowledgeBaseOverview {
  id: string
  name: string
  description: string | null
  scope: KbScope
  departmentId: string | null
  departmentName: string | null
  createdById: string
  creatorName: string
  documentCount: number
  createdAt: string
  updatedAt: string
}

export interface KnowledgeBaseDetail extends KnowledgeBaseOverview {
  documents: KnowledgeDocumentInfo[]
}

export interface KnowledgeDocumentInfo {
  id: string
  docId: string
  fileName: string
  fileSize: number
  pageCount: number | null
  status: DocumentStatus
  jobId: string | null
  errorMessage: string | null
  createdAt: string
  updatedAt: string
}

export interface KnowledgeBaseListResponse {
  knowledgeBases: KnowledgeBaseOverview[]
  total: number
}

export interface IngestionJobStatus {
  job_id: string
  status: string
  progress: number
  logs: string[]
  error: string | null
  page_count: number | null
}

export interface QueryStreamEvent {
  type: 'retrieval' | 'reasoning' | 'chunk' | 'error' | 'done'
  data: Record<string, unknown>
}

export interface RetrievalSource {
  text: string
  score: number
  source_type: string
  metadata: Record<string, unknown>
}

/** Serialized scored node from web_helpers — used for sources and assets */
export interface ScoredNode {
  kind: string // "text" | "image" | "table"
  score: number
  doc_id: string
  page_no: number | null
  page_label: string
  source_path: string
  summary: string
  // text-specific
  text?: string
  snippet?: string
  block_id?: string
  // image-specific
  image_id?: string
  image_path?: string
  image_url?: string
  // table-specific
  table_id?: string
  caption?: string
  semantic_summary?: string
  headers?: string[]
  raw_table?: string
  raw_format?: string
  normalized_table_text?: string
}
