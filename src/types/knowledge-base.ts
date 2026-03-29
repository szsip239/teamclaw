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
