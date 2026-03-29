import { buildRagCredentialHeaders } from './credentials'

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://rag:8000'
const RAG_SERVICE_SECRET = process.env.RAG_SERVICE_SECRET || ''

async function ragFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const credHeaders = await buildRagCredentialHeaders()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-service-secret': RAG_SERVICE_SECRET,
    ...credHeaders,
    ...(options.headers as Record<string, string> ?? {}),
  }

  return fetch(`${RAG_SERVICE_URL}${path}`, {
    ...options,
    headers,
  })
}

/** Submit a document for ingestion (OCR + vectorization). */
export async function submitIngestionJob(params: {
  kbId: string
  docId: string
  filePath: string
  ocrModel?: string
  ocrWorkers?: number
}): Promise<{ job_id: string; status: string }> {
  const res = await ragFetch('/api/ingest', {
    method: 'POST',
    body: JSON.stringify({
      kb_id: params.kbId,
      doc_id: params.docId,
      file_path: params.filePath,
      ocr_model: params.ocrModel,
      ocr_workers: params.ocrWorkers,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `RAG ingest failed: ${res.status}`)
  }

  return res.json()
}

/** Get job processing status. */
export async function getJobStatus(jobId: string): Promise<{
  job_id: string
  status: string
  progress: number
  logs: string[]
  error: string | null
  page_count: number | null
} | null> {
  const res = await ragFetch(`/api/jobs/${jobId}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`RAG job status failed: ${res.status}`)
  return res.json()
}

/** Delete vectors for a KB or specific document. */
export async function deleteVectors(kbId: string, docId?: string): Promise<number> {
  const res = await ragFetch('/api/documents', {
    method: 'DELETE',
    body: JSON.stringify({ kb_id: kbId, doc_id: docId ?? null }),
  })

  if (!res.ok) throw new Error(`RAG delete failed: ${res.status}`)
  const data = await res.json()
  return data.deleted_count
}

/** Stream a Q&A query. Returns a ReadableStream for SSE proxying. */
export async function queryStream(params: {
  kbId: string
  question: string
  generateAnswer?: boolean
  topK?: number
}): Promise<ReadableStream<Uint8Array>> {
  const res = await ragFetch('/api/query/stream', {
    method: 'POST',
    body: JSON.stringify({
      kb_id: params.kbId,
      question: params.question,
      generate_answer: params.generateAnswer ?? true,
      top_k: params.topK ?? 5,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `RAG query failed: ${res.status}`)
  }

  if (!res.body) throw new Error('No response body from RAG service')
  return res.body
}

/** Get suggested queries for a KB. */
export async function getDefaultQueries(kbId: string): Promise<string[]> {
  const res = await ragFetch(`/api/knowledge-bases/${kbId}/default-queries`)
  if (!res.ok) return []
  const data = await res.json()
  return data.queries ?? []
}
