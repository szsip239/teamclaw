import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/auth/encryption'

interface RagCredentialHeaders {
  'x-llm-api-key': string
  'x-llm-base-url': string
  'x-llm-model': string
  'x-embedding-api-key': string
  'x-embedding-base-url': string
  'x-embedding-model': string
  'x-rerank-enabled': string
  'x-rerank-api-key': string
  'x-rerank-base-url': string
  'x-rerank-model': string
  'x-ocr-model': string
  'x-ocr-workers': string
  'x-paddleocr-token': string
  'x-paddleocr-model': string
}

/**
 * Load RAG credentials from SystemConfig and build headers for the Python RAG service.
 * API keys stored as encrypted JSON; non-sensitive values stored as plain strings.
 */
export async function buildRagCredentialHeaders(): Promise<RagCredentialHeaders> {
  const configs = await prisma.systemConfig.findMany({
    where: { key: { startsWith: 'rag.' } },
  })

  const configMap = new Map<string, unknown>()
  for (const c of configs) {
    configMap.set(c.key, c.value)
  }

  function getString(key: string): string {
    const val = configMap.get(key)
    if (typeof val === 'string') return val
    return ''
  }

  function getApiKey(key: string): string {
    const val = configMap.get(key)
    if (typeof val !== 'string' || !val) return ''
    try {
      // Try to decrypt (stored encrypted)
      const parsed = JSON.parse(decrypt(val)) as { apiKey: string }
      return parsed.apiKey || ''
    } catch {
      // If decryption fails, return as-is (for migration period or plain text)
      return val
    }
  }

  return {
    'x-llm-api-key': getApiKey('rag.llm.apiKey'),
    'x-llm-base-url': getString('rag.llm.baseUrl'),
    'x-llm-model': getString('rag.llm.model'),
    'x-embedding-api-key': getApiKey('rag.embedding.apiKey'),
    'x-embedding-base-url': getString('rag.embedding.baseUrl'),
    'x-embedding-model': getString('rag.embedding.model'),
    'x-rerank-enabled': String(configMap.get('rag.rerank.enabled') ?? false),
    'x-rerank-api-key': getApiKey('rag.rerank.apiKey'),
    'x-rerank-base-url': getString('rag.rerank.baseUrl'),
    'x-rerank-model': getString('rag.rerank.model'),
    'x-ocr-model': getString('rag.ocr.model'),
    'x-ocr-workers': String(configMap.get('rag.ocr.workers') ?? 4),
    'x-paddleocr-token': getString('rag.paddleocr.token'),
    'x-paddleocr-model': getString('rag.paddleocr.model'),
  }
}
