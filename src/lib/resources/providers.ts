import type { ResourceType, ProviderInfo } from '@/types/resource'

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
//
// Each entry is the static "override" teamclaw maintains on top of the
// upstream models.dev catalog: connection params (baseUrl/apiType/env),
// icon, testEndpoint, localization — things models.dev doesn't provide
// or that teamclaw needs to customize. Model catalogs themselves are
// pulled dynamically from models.dev via `modelsDevId`.

export interface ProviderDef extends ProviderInfo {
  testEndpoint: {
    url: string | ((baseUrl: string) => string)
    method: string
    headers: (key: string) => Record<string, string>
    /**
     * Optional request body. Receives both the decrypted API key and the
     * effective baseUrl so providers with multiple endpoints (variants) can
     * pick a variant-appropriate model id.
     */
    body?: (key: string, baseUrl: string) => unknown
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
    modelsDevId: 'anthropic',
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
    modelsDevId: 'openai',
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
    modelsDevId: 'google',
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
    modelsDevId: 'openrouter',
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
    modelsDevId: 'groq',
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
    modelsDevId: 'cerebras',
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
    modelsDevId: 'mistral',
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
    modelsDevId: 'xai',
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
    modelsDevId: 'deepseek',
    testEndpoint: {
      url: 'https://api.deepseek.com/v1/models',
      method: 'GET',
      headers: bearerAuth,
    },
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'MOONSHOT_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.moonshot.ai/v1',
    icon: 'moonshot',
    description: 'Kimi 系列模型（国际/国内/Coding 三个端点）',
    modelsDevId: 'moonshotai',
    variants: [
      { id: 'intl-regular', label: '国际 · 普通', baseUrl: 'https://api.moonshot.ai/v1', envVarName: 'MOONSHOT_API_KEY', apiType: 'openai-completions', modelsDevId: 'moonshotai' },
      { id: 'cn-regular', label: '国内 · 普通', baseUrl: 'https://api.moonshot.cn/v1', envVarName: 'MOONSHOT_API_KEY', apiType: 'openai-completions', modelsDevId: 'moonshotai-cn' },
      { id: 'coding', label: 'Coding Plan', baseUrl: 'https://api.kimi.com/coding/v1', envVarName: 'KIMI_CODING_API_KEY', apiType: 'openai-completions', modelsDevId: 'kimi-for-coding' },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/chat/completions`,
      method: 'POST',
      headers: bearerAuth,
      body: () => ({ model: 'moonshot-v1-8k', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    },
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
    description: 'MiniMax 系列模型（国际/国内 × 普通/Coding 四种组合）',
    modelsDevId: 'minimax',
    variants: [
      { id: 'intl-regular', label: '国际 · 普通', baseUrl: 'https://api.minimax.io/anthropic', envVarName: 'MINIMAX_API_KEY', apiType: 'anthropic-messages', modelsDevId: 'minimax' },
      { id: 'intl-coding', label: '国际 · Coding', baseUrl: 'https://api.minimax.io/anthropic', envVarName: 'MINIMAX_CODING_API_KEY', apiType: 'anthropic-messages', modelsDevId: 'minimax-coding-plan' },
      { id: 'cn-regular', label: '国内 · 普通', baseUrl: 'https://api.minimaxi.com/anthropic', envVarName: 'MINIMAX_API_KEY', apiType: 'anthropic-messages', modelsDevId: 'minimax-cn' },
      { id: 'cn-coding', label: '国内 · Coding', baseUrl: 'https://api.minimaxi.com/anthropic', envVarName: 'MINIMAX_CODING_API_KEY', apiType: 'anthropic-messages', modelsDevId: 'minimax-cn-coding-plan' },
    ],
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/v1/messages`,
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
    id: 'xiaomi',
    name: 'Xiaomi MiMo',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'XIAOMI_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://api.xiaomimimo.com/v1',
    icon: 'xiaomi',
    description: '小米 MiMo 系列模型',
    modelsDevId: 'xiaomi',
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/models`,
      method: 'GET',
      headers: bearerAuth,
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
    modelsDevId: 'togetherai',
    testEndpoint: {
      url: 'https://api.together.xyz/v1/models',
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
    modelsDevId: 'nvidia',
    testEndpoint: {
      url: 'https://integrate.api.nvidia.com/v1/models',
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
    // No modelsDevId: teamclaw's default ollama is local (127.0.0.1); models.dev
    // only has ollama-cloud (ollama.com). Models depend on what the user pulled
    // locally, so auto-sync doesn't apply.
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
    // No modelsDevId: self-hosted, no public model registry.
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
    description: 'GLM 系列模型（智谱清言 / Coding Plan）',
    modelsDevId: 'zai-coding-plan',
    baseUrlHint: 'zai',
    variants: [
      { id: 'coding', label: 'Coding Plan', baseUrl: 'https://api.z.ai/api/coding/paas/v4', envVarName: 'ZAI_API_KEY', apiType: 'openai-completions', modelsDevId: 'zai-coding-plan' },
      { id: 'regular', label: '普通', baseUrl: 'https://api.z.ai/api/paas/v4', envVarName: 'ZAI_API_KEY', apiType: 'openai-completions', modelsDevId: 'zai' },
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
    id: 'qwen',
    name: '通义千问 (Qwen)',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'DASHSCOPE_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    icon: 'qwen',
    description: '阿里云通义千问 / DashScope（国内/国际 × 普通/Coding 四种组合）',
    modelsDevId: 'alibaba-cn',
    variants: [
      { id: 'cn-regular', label: '国内 · 普通', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', envVarName: 'DASHSCOPE_API_KEY', apiType: 'openai-completions', modelsDevId: 'alibaba-cn' },
      { id: 'cn-coding', label: '国内 · Coding', baseUrl: 'https://coding.dashscope.aliyuncs.com/v1', envVarName: 'DASHSCOPE_CODING_API_KEY', apiType: 'openai-completions', modelsDevId: 'alibaba-coding-plan-cn' },
      { id: 'intl-regular', label: '国际 · 普通', baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1', envVarName: 'DASHSCOPE_API_KEY', apiType: 'openai-completions', modelsDevId: 'alibaba' },
      { id: 'intl-coding', label: '国际 · Coding', baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/v1', envVarName: 'DASHSCOPE_CODING_API_KEY', apiType: 'openai-completions', modelsDevId: 'alibaba-coding-plan' },
    ],
    // Coding plan 端点只支持 coder 模型；普通端点不支持 coder。依 baseUrl 路由选 model。
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/chat/completions`,
      method: 'POST',
      headers: bearerAuth,
      body: (_key, baseUrl) => ({
        model: baseUrl.includes('coding.dashscope') || baseUrl.includes('coding-intl.dashscope')
          ? 'qwen3-coder-plus'
          : 'qwen-plus',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    },
  },
  {
    id: 'doubao',
    name: '火山方舟 (Volcengine ARK)',
    type: 'MODEL',
    authMethod: 'API_KEY',
    envVarName: 'ARK_API_KEY',
    apiType: 'openai-completions',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    icon: 'doubao',
    description: '字节跳动火山方舟（普通/Coding 两种端点，Doubao / DeepSeek / GLM / Kimi 等）',
    // No modelsDevId on any variant: models.dev has no volcengine entry.
    variants: [
      { id: 'regular', label: '普通', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', envVarName: 'ARK_API_KEY', apiType: 'openai-completions' },
      { id: 'coding', label: 'Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding/v3', envVarName: 'ARK_CODING_API_KEY', apiType: 'anthropic-messages' },
    ],
    configFields: [
      { key: 'baseUrl', label: 'API 地址', placeholder: 'https://ark.cn-beijing.volces.com/api/v3', required: false },
    ],
    // For the regular endpoint we hit /models (GET); the coding endpoint
    // follows the Anthropic messages pattern. Variant-aware behavior is
    // handled in the test handler based on apiType.
    testEndpoint: {
      url: (baseUrl: string) => `${baseUrl}/models`,
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
    modelsDevId: 'opencode',
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
    // No modelsDevId: generic catchall.
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
  return getProviders(type).map(({ testEndpoint: _te, ...info }) => info)
}
