import type { ResourceType, ProviderInfo, ModelDefinition } from '@/types/resource'

// ─── API Types ──────────────────────────────────────────────────────

export const API_TYPES = [
  { value: 'anthropic-messages', label: 'Anthropic Messages' },
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'google-generative-ai', label: 'Google Generative AI' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'bedrock-converse-stream', label: 'AWS Bedrock' },
] as const

export type ApiType = (typeof API_TYPES)[number]['value']

// ─── Provider Definition ────────────────────────────────────────────

export interface ProviderDef extends ProviderInfo {
  defaultModels?: ModelDefinition[]
  testEndpoint: {
    url: string | ((baseUrl: string) => string)
    method: string
    headers: (key: string) => Record<string, string>
    body?: (key: string) => unknown
  }
}

function bearerAuth(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` }
}

function anthropicAuth(key: string): Record<string, string> {
  return {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  }
}

// ─── Model Providers ─────────────────────────────────────────────────

const modelProviders: ProviderDef[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'ANTHROPIC_API_KEY',
    apiType: 'anthropic-messages',
    baseUrl: 'https://api.anthropic.com',
    icon: 'anthropic',
    description: 'Claude 系列模型',
    defaultModels: [
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', reasoning: true, input: ['text', 'image'], cost: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 }, contextWindow: 200000, maxTokens: 32000 },
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', reasoning: true, input: ['text', 'image'], cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 }, contextWindow: 200000, maxTokens: 16000 },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', reasoning: true, input: ['text', 'image'], cost: { input: 0.8, output: 4, cacheRead: 0.08, cacheWrite: 1 }, contextWindow: 200000, maxTokens: 16000 },
    ],
    testEndpoint: {
      url: 'https://api.anthropic.com/v1/messages',
      method: 'POST',
      headers: anthropicAuth,
      body: () => ({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'OPENAI_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.openai.com',
    icon: 'openai',
    description: 'GPT 系列模型',
    defaultModels: [
      { id: 'o3', name: 'o3', reasoning: true, input: ['text', 'image'], cost: { input: 10, output: 40, cacheRead: 2.5, cacheWrite: 10 }, contextWindow: 200000, maxTokens: 100000 },
      { id: 'o4-mini', name: 'o4-mini', reasoning: true, input: ['text', 'image'], cost: { input: 1.1, output: 4.4, cacheRead: 0.275, cacheWrite: 1.1 }, contextWindow: 200000, maxTokens: 100000 },
      { id: 'gpt-4.1', name: 'GPT-4.1', reasoning: false, input: ['text', 'image'], cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 2 }, contextWindow: 1047576, maxTokens: 32768 },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', reasoning: false, input: ['text', 'image'], cost: { input: 0.4, output: 1.6, cacheRead: 0.1, cacheWrite: 0.4 }, contextWindow: 1047576, maxTokens: 32768 },
    ],
    testEndpoint: {
      url: 'https://api.openai.com/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'google',
    name: 'Google',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'GEMINI_API_KEY',
    apiType: 'google-generative-ai',
    baseUrl: 'https://generativelanguage.googleapis.com',
    icon: 'google',
    description: 'Gemini 系列模型',
    defaultModels: [
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', reasoning: true, input: ['text', 'image'], cost: { input: 1.25, output: 10, cacheRead: 0.31, cacheWrite: 1.25 }, contextWindow: 1048576, maxTokens: 65536 },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: true, input: ['text', 'image'], cost: { input: 0.15, output: 0.6, cacheRead: 0.0375, cacheWrite: 0.15 }, contextWindow: 1048576, maxTokens: 65536 },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/v1/models`,
      method: 'GET',
      headers: () => ({}),
    },
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://generativelanguage.googleapis.com', required: false },
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'OPENROUTER_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://openrouter.ai/api',
    icon: 'openrouter',
    description: '多模型路由',
    testEndpoint: {
      url: 'https://openrouter.ai/api/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'groq',
    name: 'Groq',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'GROQ_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.groq.com/openai',
    icon: 'groq',
    description: '超快推理引擎',
    testEndpoint: {
      url: 'https://api.groq.com/openai/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'CEREBRAS_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.cerebras.ai',
    icon: 'cerebras',
    description: 'Cerebras 推理',
    testEndpoint: {
      url: 'https://api.cerebras.ai/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'mistral',
    name: 'Mistral',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'MISTRAL_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.mistral.ai',
    icon: 'mistral',
    description: 'Mistral 系列模型',
    testEndpoint: {
      url: 'https://api.mistral.ai/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'xai',
    name: 'xAI',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'XAI_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.x.ai',
    icon: 'xai',
    description: 'Grok 系列模型',
    defaultModels: [
      { id: 'grok-3', name: 'Grok 3', reasoning: false, input: ['text', 'image'], cost: { input: 3, output: 15 }, contextWindow: 131072, maxTokens: 16384 },
      { id: 'grok-3-mini', name: 'Grok 3 Mini', reasoning: true, input: ['text', 'image'], cost: { input: 0.3, output: 0.5 }, contextWindow: 131072, maxTokens: 16384 },
    ],
    testEndpoint: {
      url: 'https://api.x.ai/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'DEEPSEEK_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.deepseek.com',
    icon: 'deepseek',
    description: 'DeepSeek 系列模型',
    defaultModels: [
      { id: 'deepseek-chat', name: 'DeepSeek V3', reasoning: false, input: ['text'], cost: { input: 0.27, output: 1.1, cacheRead: 0.07, cacheWrite: 0.27 }, contextWindow: 65536, maxTokens: 8192 },
      { id: 'deepseek-reasoner', name: 'DeepSeek R1', reasoning: true, input: ['text'], cost: { input: 0.55, output: 2.19, cacheRead: 0.14, cacheWrite: 0.55 }, contextWindow: 65536, maxTokens: 8192 },
    ],
    testEndpoint: {
      url: 'https://api.deepseek.com/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'MOONSHOT_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.moonshot.ai/v1',
    icon: 'moonshot',
    description: 'Kimi 系列模型',
    testEndpoint: {
      url: 'https://api.moonshot.ai/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://api.moonshot.ai/v1 或 https://api.moonshot.cn/v1', required: false },
    ],
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'MINIMAX_API_KEY',
    apiType: 'anthropic-messages',
    baseUrl: 'https://api.minimax.io/anthropic',
    icon: 'minimax',
    description: 'MiniMax 系列模型',
    defaultModels: [
      { id: 'MiniMax-M2.5', name: 'MiniMax M2.5', reasoning: true, input: ['text'], cost: { input: 15, output: 60, cacheRead: 2, cacheWrite: 10 }, contextWindow: 200000, maxTokens: 8192 },
      { id: 'MiniMax-M2.1', name: 'MiniMax M2.1', reasoning: true, input: ['text'], cost: { input: 4, output: 16, cacheRead: 1, cacheWrite: 4 }, contextWindow: 200000, maxTokens: 8192 },
    ],
    testEndpoint: {
      url: 'https://api.minimax.io/anthropic/v1/messages',
      method: 'POST',
      headers: anthropicAuth,
      body: () => ({
        model: 'MiniMax-M2.5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
  },
  {
    id: 'venice',
    name: 'Venice',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'VENICE_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.venice.ai/api/v1',
    icon: 'venice',
    description: 'Venice AI 隐私优先模型',
    testEndpoint: {
      url: 'https://api.venice.ai/api/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'xiaomi',
    name: '小米 MiMo',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'XIAOMI_API_KEY',
    apiType: 'anthropic-messages',
    baseUrl: 'https://api.xiaomimimo.com/anthropic',
    icon: 'xiaomi',
    description: '小米 MiMo 推理模型',
    testEndpoint: {
      url: 'https://api.xiaomimimo.com/anthropic/v1/messages',
      method: 'POST',
      headers: anthropicAuth,
      body: () => ({
        model: 'MiMo-72B-preview',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
  },
  {
    id: 'together',
    name: 'Together',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'TOGETHER_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.together.xyz',
    icon: 'together',
    description: 'Together AI 开源模型',
    testEndpoint: {
      url: 'https://api.together.xyz/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'HF_TOKEN',
    apiType: 'openai-completions',
    baseUrl: 'https://router.huggingface.co/v1',
    icon: 'huggingface',
    description: 'HuggingFace 推理路由',
    testEndpoint: {
      url: 'https://router.huggingface.co/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'NVIDIA_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    icon: 'nvidia',
    description: 'NVIDIA NIM 推理',
    testEndpoint: {
      url: 'https://integrate.api.nvidia.com/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'litellm',
    name: 'LiteLLM',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'LITELLM_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'http://localhost:4000',
    icon: 'litellm',
    description: 'LiteLLM 代理网关',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'http://localhost:4000', required: false },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/v1/models`,
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'ollama',
    name: 'Ollama',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'OLLAMA_API_KEY',
    apiType: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    icon: 'ollama',
    description: 'Ollama 本地模型',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'http://127.0.0.1:11434', required: false },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/api/tags`,
      method: 'GET',
      headers: () => ({}),
    },
  },
  {
    id: 'vllm',
    name: 'vLLM',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'VLLM_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'http://127.0.0.1:8000/v1',
    icon: 'vllm',
    description: 'vLLM 高性能推理',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'http://127.0.0.1:8000/v1', required: false },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/models`,
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'zai',
    name: 'Z.AI (智谱)',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'ZAI_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    icon: 'zai',
    description: 'GLM 系列模型（智谱清言）',
    baseUrlHint: 'zai',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://api.z.ai/api/coding/paas/v4', required: false },
    ],
    defaultModels: [
      { id: 'glm-5', name: 'GLM-5', reasoning: true, input: ['text', 'image'], contextWindow: 205000, maxTokens: 16000 },
      { id: 'glm-4.7', name: 'GLM-4.7', reasoning: true, input: ['text', 'image'], contextWindow: 205000, maxTokens: 16000 },
      { id: 'glm-4.7-flash', name: 'GLM-4.7 Flash', reasoning: false, input: ['text', 'image'], contextWindow: 200000, maxTokens: 16000 },
      { id: 'glm-4.6', name: 'GLM-4.6', reasoning: false, input: ['text', 'image'], contextWindow: 205000, maxTokens: 16000 },
      { id: 'glm-4.6v', name: 'GLM-4.6V', reasoning: false, input: ['text', 'image'], contextWindow: 128000, maxTokens: 4096 },
      { id: 'glm-4.5-flash', name: 'GLM-4.5 Flash', reasoning: false, input: ['text', 'image'], contextWindow: 131000, maxTokens: 4096 },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/chat/completions`,
      method: 'POST',
      headers: bearerAuth,
      body: () => ({
        model: 'glm-4.5-flash',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
  },
  {
    id: 'qianfan',
    name: '千帆',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'QIANFAN_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://qianfan.baidubce.com',
    icon: 'qianfan',
    description: '百度千帆大模型',
    testEndpoint: {
      url: 'https://qianfan.baidubce.com/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'doubao',
    name: '豆包',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'DOUBAO_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    icon: 'doubao',
    description: '字节跳动豆包大模型',
    testEndpoint: {
      url: 'https://ark.cn-beijing.volces.com/api/v3/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'OPENCODE_API_KEY',
    apiType: 'openai-completions',
    icon: 'opencode',
    description: 'OpenCode 兼容模型',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://your-api.example.com/v1', required: true },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/models`,
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'custom',
    name: '自定义模型',
    type: 'MODEL',
    authMethod: 'API_KEY',
    icon: 'custom',
    description: '自定义 OpenAI 兼容 API',
    apiType: 'openai-completions',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://your-api.example.com/v1', required: true },
      { key: 'envVarName', label: '环境变量名', placeholder: 'CUSTOM_API_KEY', required: false },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/models`,
      method: 'GET',
      headers: bearerAuth,
    },
  },
]

// ─── Tool Providers ──────────────────────────────────────────────────

const toolProviders: ProviderDef[] = [
  {
    id: 'brave',
    name: 'Brave Search',
    type: 'TOOL',
    authMethod: 'API_KEY',
    envVarName: 'BRAVE_API_KEY',
    icon: 'brave',
    description: 'Brave 搜索 API',
    testEndpoint: {
      url: 'https://api.search.brave.com/res/v1/web/search?q=test&count=1',
      method: 'GET',
      headers: (key: string) => ({ 'X-Subscription-Token': key }),
    },
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    type: 'TOOL',
    authMethod: 'API_KEY',
    envVarName: 'FIRECRAWL_API_KEY',
    icon: 'firecrawl',
    description: '网页抓取与提取',
    testEndpoint: {
      url: 'https://api.firecrawl.dev/v1/scrape',
      method: 'POST',
      headers: bearerAuth,
      body: () => ({ url: 'https://example.com', formats: ['markdown'] }),
    },
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    type: 'TOOL',
    authMethod: 'API_KEY',
    envVarName: 'ELEVENLABS_API_KEY',
    icon: 'elevenlabs',
    description: 'AI 语音合成',
    testEndpoint: {
      url: 'https://api.elevenlabs.io/v1/voices',
      method: 'GET',
      headers: (key: string) => ({ 'xi-api-key': key }),
    },
  },
  {
    id: 'custom-tool',
    name: '自定义工具',
    type: 'TOOL',
    authMethod: 'API_KEY',
    icon: 'custom',
    description: '自定义工具 API',
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://your-tool.example.com', required: true },
      { key: 'envVarName', label: '环境变量名', placeholder: 'CUSTOM_TOOL_KEY', required: false },
    ],
    testEndpoint: {
      url: (baseUrl: string) => baseUrl,
      method: 'GET',
      headers: bearerAuth,
    },
  },
]

// ─── Registry ────────────────────────────────────────────────────────

const allProviders: ProviderDef[] = [...modelProviders, ...toolProviders]

const providerMap = new Map<string, ProviderDef>(
  allProviders.map((p) => [p.id, p]),
)

export function getProvider(id: string): ProviderDef | undefined {
  return providerMap.get(id)
}

export function getProviders(type?: ResourceType): ProviderDef[] {
  if (!type) return allProviders
  return allProviders.filter((p) => p.type === type)
}

/** Return public ProviderInfo (without testEndpoint internals) */
export function getProviderInfoList(type?: ResourceType): ProviderInfo[] {
  return getProviders(type).map(({ testEndpoint: _te, defaultModels, ...info }) => ({
    ...info,
    defaultModels,
  }))
}
