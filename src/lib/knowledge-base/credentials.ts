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

function envFirst(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

function normalizeEmbeddingBaseUrl(value: string): string {
  const clean = value.replace(/\/+$/, '')
  return clean.endsWith('/embeddings')
    ? clean.slice(0, -'/embeddings'.length)
    : clean
}

/**
 * Load RAG credentials from SystemConfig and build headers for the Python RAG service.
 * API keys stored as encrypted JSON; non-sensitive values stored as plain strings.
 * Falls back to the standalone llm-rag .env naming convention so deployments
 * can be migrated without first filling SystemConfig through the UI.
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
    'x-llm-api-key': getApiKey('rag.llm.apiKey') || envFirst('LLM_API_KEY', 'DASHSCOPE_API_KEY'),
    'x-llm-base-url': getString('rag.llm.baseUrl') || envFirst('LLM_BASE_URL') || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    'x-llm-model': getString('rag.llm.model') || envFirst('LLM_MODEL') || 'qwen3.5-35b-a3b',
    'x-embedding-api-key': getApiKey('rag.embedding.apiKey') || envFirst('SILICONFLOW_API_KEY'),
    'x-embedding-base-url': normalizeEmbeddingBaseUrl(
      getString('rag.embedding.baseUrl') ||
      envFirst('SILICONFLOW_EMBEDDING_URL') ||
      'https://api.siliconflow.cn/v1/embeddings',
    ),
    'x-embedding-model': getString('rag.embedding.model') || envFirst('SILICONFLOW_EMBEDDING_MODEL') || 'BAAI/bge-m3',
    'x-rerank-enabled': String(configMap.get('rag.rerank.enabled') ?? false),
    'x-rerank-api-key': getApiKey('rag.rerank.apiKey') || envFirst('SILICONFLOW_API_KEY'),
    'x-rerank-base-url': getString('rag.rerank.baseUrl') || 'https://api.siliconflow.cn/v1',
    'x-rerank-model': getString('rag.rerank.model'),
    'x-ocr-model': getString('rag.ocr.model'),
    'x-ocr-workers': String(configMap.get('rag.ocr.workers') ?? 4),
    'x-paddleocr-token': getString('rag.paddleocr.token') || envFirst('PADDLEOCR_TOKEN'),
    'x-paddleocr-model': getString('rag.paddleocr.model') || envFirst('PADDLEOCR_MODEL') || 'PP-OCRv5',
  }
}
