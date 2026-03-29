export interface RagConfig {
  'rag.llm.baseUrl': string
  'rag.llm.apiKey': string
  'rag.llm.model': string
  'rag.embedding.baseUrl': string
  'rag.embedding.apiKey': string
  'rag.embedding.model': string
  'rag.rerank.enabled': boolean
  'rag.rerank.baseUrl': string
  'rag.rerank.apiKey': string
  'rag.rerank.model': string
  'rag.ocr.model': string
  'rag.ocr.workers': number
}
