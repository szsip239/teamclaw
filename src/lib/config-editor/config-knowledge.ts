// ─── Config Knowledge Base ─────────────────────────────────────────
// Local knowledge extracted from OpenClaw documentation.
// Provides module categorization, field grouping, and bilingual descriptions
// that the raw JSON Schema doesn't contain.
//
// Uses BiText type for compile-time bilingual completeness guarantee:
// missing either `zh` or `en` → TypeScript error.

import type { Language } from '@/stores/language-store'

// ─── BiText Type & Resolver ─────────────────────────────────────────

/** Bilingual text — TypeScript enforces both languages are present */
export type BiText = { zh: string; en: string }

/** Resolve a BiText to a plain string for the given locale */
function t(text: BiText, locale: Language): string {
  return locale === 'en' ? text.en : text.zh
}

// ─── Module Categories ───────────────────────────────────────────────

export interface ModuleCategory {
  id: string
  label: BiText
  modules: string[]
}

export const MODULE_CATEGORIES: ModuleCategory[] = [
  { id: 'core', label: { zh: '核心服务', en: 'Core Services' }, modules: ['gateway', 'models', 'agents'] },
  { id: 'communication', label: { zh: '通信渠道', en: 'Communication' }, modules: ['channels', 'session', 'messages'] },
  { id: 'capabilities', label: { zh: '功能扩展', en: 'Capabilities' }, modules: ['tools', 'skills', 'plugins', 'browser', 'talk'] },
  { id: 'automation', label: { zh: '自动化', en: 'Automation' }, modules: ['hooks', 'cron', 'commands', 'bindings'] },
  { id: 'system', label: { zh: '系统', en: 'System' }, modules: ['auth', 'env', 'logging', 'ui', 'discovery', 'web', 'canvasHost', 'wizard'] },
]

// ─── Module Knowledge ────────────────────────────────────────────────

export interface ModuleKnowledge {
  description: BiText
  /** Whether changes require a gateway restart (vs hot-reload) */
  requiresRestart?: boolean
}

export const MODULE_KNOWLEDGE: Record<string, ModuleKnowledge> = {
  gateway: {
    description: {
      zh: '网关服务器配置，包括端口、网络绑定、认证方式和 Control UI 设置。',
      en: 'Gateway server configuration including port, network binding, authentication, and Control UI settings.',
    },
    requiresRestart: true,
  },
  agents: {
    description: {
      zh: '智能体的默认配置和智能体列表，包括模型选择、工作区、压缩策略等。',
      en: 'Agent defaults and agent list, including model selection, workspace, compaction strategies, etc.',
    },
  },
  models: {
    description: {
      zh: 'AI 模型提供商目录，管理 API 密钥、端点和可用模型列表。',
      en: 'AI model provider catalog — manage API keys, endpoints, and available model lists.',
    },
  },
  channels: {
    description: {
      zh: '消息平台集成（Telegram、Discord、Slack、飞书等），每个平台有独立的连接和策略配置。',
      en: 'Messaging platform integrations (Telegram, Discord, Slack, Lark, etc.) with per-platform connection and policy settings.',
    },
  },
  session: {
    description: {
      zh: '会话管理配置，控制会话隔离、自动重置、消息存储和发送策略。',
      en: 'Session management — controls session isolation, auto-reset, message storage, and send policies.',
    },
  },
  messages: {
    description: {
      zh: '消息处理配置，包括格式化、确认反应、消息队列、语音合成和群聊设置。',
      en: 'Message handling — formatting, acknowledgment reactions, message queue, TTS, and group chat settings.',
    },
  },
  tools: {
    description: {
      zh: '工具权限和执行配置，包括命令执行、Web 工具、媒体处理和多智能体协作。',
      en: 'Tool permissions and execution — command execution, web tools, media processing, and multi-agent collaboration.',
    },
  },
  skills: {
    description: {
      zh: '技能管理配置，控制内置技能白名单、加载路径和安装策略。',
      en: 'Skill management — built-in skill allowlist, loading paths, and installation strategy.',
    },
  },
  plugins: {
    description: {
      zh: '插件系统配置，管理第三方插件的加载和权限。',
      en: 'Plugin system — manage third-party plugin loading and permissions.',
    },
  },
  browser: {
    description: {
      zh: '浏览器工具配置，控制 CDP 浏览器自动化、配置文件和执行选项。',
      en: 'Browser tool — CDP browser automation, profiles, and execution options.',
    },
  },
  talk: {
    description: {
      zh: '语音对话配置，包括 ElevenLabs TTS 语音、模型和实时对话设置。',
      en: 'Voice conversation — ElevenLabs TTS voices, models, and real-time conversation settings.',
    },
  },
  hooks: {
    description: {
      zh: 'Webhook 集成配置，将外部 HTTP 事件路由到智能体处理。',
      en: 'Webhook integration — route external HTTP events to agents for processing.',
    },
  },
  cron: {
    description: {
      zh: '定时任务配置，设定周期性触发的智能体任务。',
      en: 'Cron jobs — schedule periodic agent tasks.',
    },
  },
  commands: {
    description: {
      zh: '自定义命令配置，控制 /commands 文本命令、bash 和调试命令的权限。',
      en: 'Custom commands — control /commands text commands, bash, and debug command permissions.',
    },
  },
  bindings: {
    description: {
      zh: '多智能体消息路由规则，将渠道消息按匹配条件分配给指定智能体。',
      en: 'Multi-agent message routing — assign channel messages to specific agents by matching rules.',
    },
  },
  auth: {
    description: {
      zh: 'API 密钥配置文件管理，管理 OAuth 和 API 密钥认证配置。',
      en: 'Auth profile management — manage OAuth and API key authentication configurations.',
    },
  },
  env: {
    description: {
      zh: '环境变量配置，管理智能体运行时可用的环境变量和 shell 环境加载。',
      en: 'Environment variables — manage runtime env vars and shell environment loading.',
    },
  },
  logging: {
    description: {
      zh: '日志配置，控制日志级别、控制台样式、文件输出和敏感信息脱敏。',
      en: 'Logging — control log level, console style, file output, and sensitive data redaction.',
    },
  },
  ui: {
    description: {
      zh: 'Control UI 界面配置，自定义主题强调色和助手名称/头像。',
      en: 'Control UI — customize theme accent color and assistant name/avatar.',
    },
  },
  discovery: {
    description: {
      zh: '服务发现配置，控制 mDNS 和广域 DNS-SD 的可发现性。',
      en: 'Service discovery — control mDNS and wide-area DNS-SD discoverability.',
    },
    requiresRestart: true,
  },
  web: {
    description: {
      zh: 'Web 渠道配置，控制内置 Web 聊天界面的心跳和重连策略。',
      en: 'Web channel — built-in web chat heartbeat and reconnection strategy.',
    },
  },
  canvasHost: {
    description: {
      zh: 'Canvas 画布服务配置，管理代码运行和预览环境。',
      en: 'Canvas host — manage code execution and preview environment.',
    },
  },
  wizard: {
    description: {
      zh: '设置向导配置，控制首次启动时的引导流程。',
      en: 'Setup wizard — control the first-launch onboarding flow.',
    },
  },
}

// ─── Module Icons ────────────────────────────────────────────────────

export const MODULE_ICONS: Record<string, string> = {
  gateway: '🌐',
  models: '🤖',
  agents: '🧠',
  tools: '🔧',
  channels: '📡',
  session: '💬',
  messages: '✉️',
  skills: '📚',
  plugins: '🧩',
  browser: '🌍',
  talk: '🎙️',
  hooks: '🪝',
  cron: '⏰',
  commands: '⌨️',
  bindings: '🔗',
  auth: '🔐',
  env: '🔑',
  logging: '📋',
  ui: '🎨',
  discovery: '🔍',
  web: '🕸️',
  canvasHost: '🖥️',
  wizard: '🧙',
}

// ─── Field Groups ────────────────────────────────────────────────────

export interface FieldGroup {
  id: string
  label: BiText
  description?: BiText
  /** Field keys relative to the module (e.g. ['mode', 'port', 'bind']) */
  fields: string[]
  /** Whether this group should be expanded by default */
  defaultExpanded?: boolean
}

export const MODULE_FIELD_GROUPS: Record<string, FieldGroup[]> = {
  gateway: [
    { id: 'server', label: { zh: '服务器设置', en: 'Server Settings' }, description: { zh: '网关的核心网络配置', en: 'Core network configuration for the gateway' }, fields: ['mode', 'port', 'bind'], defaultExpanded: true },
    { id: 'auth', label: { zh: '认证配置', en: 'Authentication' }, description: { zh: '客户端认证方式，非回环绑定时必须配置', en: 'Client authentication — required for non-loopback bindings' }, fields: ['auth'], defaultExpanded: true },
    { id: 'tailscale', label: { zh: 'Tailscale', en: 'Tailscale' }, description: { zh: 'Tailscale VPN 集成设置', en: 'Tailscale VPN integration settings' }, fields: ['tailscale'] },
    { id: 'controlUi', label: { zh: 'Control UI', en: 'Control UI' }, description: { zh: '内置 Web 管理界面', en: 'Built-in web management interface' }, fields: ['controlUi'] },
    { id: 'remote', label: { zh: '远程网关', en: 'Remote Gateway' }, description: { zh: '连接到远程 OpenClaw 实例', en: 'Connect to a remote OpenClaw instance' }, fields: ['remote'] },
    { id: 'security', label: { zh: '安全与代理', en: 'Security & Proxy' }, description: { zh: '受信代理和工具访问限制', en: 'Trusted proxies and tool access restrictions' }, fields: ['trustedProxies', 'tools'] },
    { id: 'http', label: { zh: 'HTTP 端点', en: 'HTTP Endpoints' }, description: { zh: 'OpenAI 兼容 API 端点', en: 'OpenAI-compatible API endpoints' }, fields: ['http'] },
    { id: 'reload', label: { zh: '热重载', en: 'Hot Reload' }, fields: ['reload'] },
  ],
  agents: [
    { id: 'defaults', label: { zh: '默认配置', en: 'Defaults' }, description: { zh: '所有智能体的全局默认设置', en: 'Global default settings inherited by all agents' }, fields: ['defaults'], defaultExpanded: true },
    { id: 'list', label: { zh: '智能体列表', en: 'Agent List' }, description: { zh: '各智能体的独立配置', en: 'Per-agent individual configurations' }, fields: ['list'] },
  ],
  models: [
    { id: 'settings', label: { zh: '模式设置', en: 'Mode Settings' }, fields: ['mode'], defaultExpanded: true },
    { id: 'providers', label: { zh: '提供商目录', en: 'Provider Catalog' }, description: { zh: '配置 AI 模型提供商的 API 密钥和端点', en: 'Configure AI model provider API keys and endpoints' }, fields: ['providers'], defaultExpanded: true },
  ],
  tools: [
    { id: 'permissions', label: { zh: '权限配置', en: 'Permissions' }, description: { zh: '工具配置文件和访问控制', en: 'Tool profiles and access control' }, fields: ['profile', 'allow', 'deny', 'byProvider'], defaultExpanded: true },
    { id: 'elevated', label: { zh: '提权执行', en: 'Elevated Execution' }, description: { zh: '允许提权运行的工具和来源', en: 'Tools and sources allowed to run with elevated privileges' }, fields: ['elevated'] },
    { id: 'exec', label: { zh: '命令执行', en: 'Command Execution' }, description: { zh: '后台任务、超时和补丁应用设置', en: 'Background tasks, timeouts, and patch application settings' }, fields: ['exec'] },
    { id: 'loop', label: { zh: '循环检测', en: 'Loop Detection' }, description: { zh: '防止智能体陷入工具调用循环', en: 'Prevent agents from getting stuck in tool-call loops' }, fields: ['loopDetection'] },
    { id: 'web', label: { zh: 'Web 工具', en: 'Web Tools' }, description: { zh: '搜索引擎和网页抓取配置', en: 'Search engine and web scraping configuration' }, fields: ['web'] },
    { id: 'media', label: { zh: '媒体处理', en: 'Media Processing' }, description: { zh: '音频、视频和图像处理模型', en: 'Audio, video, and image processing models' }, fields: ['media'] },
    { id: 'agents', label: { zh: '多智能体', en: 'Multi-Agent' }, description: { zh: '子智能体和智能体间通信', en: 'Sub-agents and inter-agent communication' }, fields: ['agentToAgent', 'sessions', 'subagents', 'sandbox'] },
  ],
  session: [
    { id: 'scope', label: { zh: '会话范围', en: 'Session Scope' }, description: { zh: '如何隔离不同用户/渠道的会话', en: 'How to isolate sessions across users and channels' }, fields: ['scope', 'dmScope', 'identityLinks', 'mainKey'], defaultExpanded: true },
    { id: 'reset', label: { zh: '自动重置', en: 'Auto Reset' }, description: { zh: '会话自动重置的触发条件', en: 'Triggers for automatic session reset' }, fields: ['reset', 'resetByType', 'resetTriggers'] },
    { id: 'storage', label: { zh: '存储', en: 'Storage' }, fields: ['store'] },
    { id: 'maintenance', label: { zh: '维护', en: 'Maintenance' }, description: { zh: '会话清理和轮换策略', en: 'Session cleanup and rotation policies' }, fields: ['maintenance'] },
    { id: 'sendPolicy', label: { zh: '发送策略', en: 'Send Policy' }, description: { zh: '控制消息发送行为的规则', en: 'Rules controlling message sending behavior' }, fields: ['sendPolicy'] },
    { id: 'agentToAgent', label: { zh: '智能体交互', en: 'Agent Interaction' }, fields: ['agentToAgent'] },
  ],
  messages: [
    { id: 'format', label: { zh: '格式化', en: 'Formatting' }, description: { zh: '消息前缀和显示格式', en: 'Message prefixes and display format' }, fields: ['responsePrefix', 'messagePrefix'], defaultExpanded: true },
    { id: 'ack', label: { zh: '确认反应', en: 'Ack Reactions' }, description: { zh: '收到消息后的自动反应', en: 'Auto-reactions when a message is received' }, fields: ['ackReaction', 'ackReactionScope', 'removeAckAfterReply'] },
    { id: 'queue', label: { zh: '消息队列', en: 'Message Queue' }, description: { zh: '多消息合并和防抖策略', en: 'Multi-message merging and debounce strategy' }, fields: ['queue'] },
    { id: 'inbound', label: { zh: '入站消息', en: 'Inbound Messages' }, fields: ['inbound'] },
    { id: 'tts', label: { zh: '语音合成', en: 'Text-to-Speech' }, description: { zh: 'TTS 引擎和语音配置', en: 'TTS engine and voice configuration' }, fields: ['tts'] },
    { id: 'groupChat', label: { zh: '群聊', en: 'Group Chat' }, fields: ['groupChat'] },
  ],
  hooks: [
    { id: 'config', label: { zh: '基础配置', en: 'Basic Config' }, fields: ['enabled', 'token', 'path', 'maxBodyBytes', 'defaultSessionKey', 'presets'], defaultExpanded: true },
    { id: 'session', label: { zh: '会话控制', en: 'Session Control' }, description: { zh: '请求中的会话键权限', en: 'Session key permissions in requests' }, fields: ['allowRequestSessionKey', 'allowedSessionKeyPrefixes', 'allowedAgentIds'] },
    { id: 'mappings', label: { zh: '映射规则', en: 'Mapping Rules' }, description: { zh: '将事件路由到智能体的规则列表', en: 'Rules for routing events to agents' }, fields: ['mappings'] },
    { id: 'transforms', label: { zh: '变换脚本', en: 'Transform Scripts' }, fields: ['transformsDir'] },
    { id: 'gmail', label: { zh: 'Gmail 集成', en: 'Gmail Integration' }, fields: ['gmail'] },
  ],
  skills: [
    { id: 'config', label: { zh: '技能配置', en: 'Skill Config' }, description: { zh: '技能加载和运行设置', en: 'Skill loading and runtime settings' }, fields: ['allowBundled', 'load', 'install', 'entries'], defaultExpanded: true },
  ],
  plugins: [
    { id: 'config', label: { zh: '插件配置', en: 'Plugin Config' }, description: { zh: '插件加载和权限设置', en: 'Plugin loading and permission settings' }, fields: ['enabled', 'allow', 'deny', 'load', 'entries'], defaultExpanded: true },
  ],
  auth: [
    { id: 'profiles', label: { zh: '认证配置文件', en: 'Auth Profiles' }, description: { zh: 'OAuth 和 API 密钥配置', en: 'OAuth and API key configurations' }, fields: ['profiles'], defaultExpanded: true },
    { id: 'order', label: { zh: '优先级', en: 'Priority' }, description: { zh: '按提供商设定配置文件的使用顺序', en: 'Set profile usage order by provider' }, fields: ['order'] },
  ],
  logging: [
    { id: 'config', label: { zh: '日志设置', en: 'Log Settings' }, fields: ['level', 'file', 'consoleLevel', 'consoleStyle', 'redactSensitive', 'redactPatterns'], defaultExpanded: true },
  ],
  cron: [
    { id: 'config', label: { zh: '定时任务', en: 'Cron Jobs' }, fields: ['enabled', 'jobs', 'maxConcurrentRuns', 'sessionRetention'], defaultExpanded: true },
  ],
  browser: [
    { id: 'config', label: { zh: '浏览器配置', en: 'Browser Config' }, fields: ['enabled', 'evaluateEnabled', 'defaultProfile', 'headless', 'noSandbox', 'executablePath', 'attachOnly', 'color'], defaultExpanded: true },
    { id: 'profiles', label: { zh: '浏览器配置文件', en: 'Browser Profiles' }, description: { zh: 'CDP 端口和远程连接', en: 'CDP ports and remote connections' }, fields: ['profiles'] },
  ],
  talk: [
    { id: 'voice', label: { zh: '语音配置', en: 'Voice Config' }, description: { zh: 'ElevenLabs TTS 设置', en: 'ElevenLabs TTS settings' }, fields: ['voiceId', 'voiceAliases', 'modelId', 'outputFormat', 'apiKey', 'interruptOnSpeech'], defaultExpanded: true },
  ],
  env: [
    { id: 'variables', label: { zh: '环境变量', en: 'Environment Variables' }, fields: ['vars', 'shellEnv'], defaultExpanded: true },
  ],
  ui: [
    { id: 'config', label: { zh: '界面配置', en: 'UI Config' }, fields: ['seamColor', 'assistant'], defaultExpanded: true },
  ],
  discovery: [
    { id: 'config', label: { zh: '发现配置', en: 'Discovery Config' }, fields: ['mdns', 'wideArea'], defaultExpanded: true },
  ],
  web: [
    { id: 'config', label: { zh: '基础配置', en: 'Basic Config' }, fields: ['enabled', 'heartbeatSeconds', 'reconnect'], defaultExpanded: true },
  ],
  commands: [
    { id: 'config', label: { zh: '命令配置', en: 'Command Config' }, fields: ['native', 'text', 'bash', 'bashForegroundMs', 'config', 'debug', 'restart', 'allowFrom', 'useAccessGroups'], defaultExpanded: true },
  ],
}

// ─── Enum Option Descriptions ────────────────────────────────────────
// Keyed by full dot-path, maps each option value to a bilingual description.

export const ENUM_DESCRIPTIONS: Record<string, Record<string, BiText>> = {
  // ── Gateway ────────────────────────────────────────────
  'gateway.mode': {
    local: { zh: '在本机直接运行网关服务', en: 'Run the gateway service directly on this machine' },
    remote: { zh: '连接到远程 OpenClaw 实例，本地仅做代理', en: 'Connect to a remote OpenClaw instance, local acts as proxy' },
  },
  'gateway.bind': {
    loopback: { zh: '仅本机访问 (127.0.0.1)，最安全的选项', en: 'Localhost only (127.0.0.1), most secure option' },
    lan: { zh: '绑定到所有接口 (0.0.0.0)，适合 Docker 和内网', en: 'Bind to all interfaces (0.0.0.0), suitable for Docker and LAN' },
    tailnet: { zh: '绑定到 Tailscale VPN 网络接口', en: 'Bind to Tailscale VPN network interface' },
    auto: { zh: '自动选择合适的绑定地址', en: 'Automatically choose an appropriate bind address' },
    custom: { zh: '自定义绑定地址', en: 'Custom bind address' },
  },
  'gateway.auth.mode': {
    none: { zh: '无认证（仅 loopback 绑定时允许）', en: 'No authentication (only allowed with loopback binding)' },
    token: { zh: '共享密钥令牌认证，最常用', en: 'Shared secret token authentication, most common' },
    password: { zh: '密码认证', en: 'Password authentication' },
    'trusted-proxy': { zh: '委托给反向代理认证', en: 'Delegate authentication to reverse proxy' },
  },
  'gateway.reload.mode': {
    hybrid: { zh: '安全字段热重载，危险字段自动重启（推荐）', en: 'Hot-reload safe fields, auto-restart for dangerous fields (recommended)' },
    hot: { zh: '仅热重载，危险变更仅警告不重启', en: 'Hot-reload only, warn but don\'t restart for dangerous changes' },
    restart: { zh: '任何配置变更都触发重启', en: 'Restart on any configuration change' },
    off: { zh: '不监控配置变更，需手动重启', en: 'Don\'t watch for config changes, manual restart required' },
  },
  'gateway.tailscale.mode': {
    off: { zh: '禁用 Tailscale 集成', en: 'Disable Tailscale integration' },
    serve: { zh: '仅 Tailnet 内部可访问', en: 'Accessible only within the Tailnet' },
    funnel: { zh: '通过 Tailscale Funnel 公开访问（带认证）', en: 'Publicly accessible via Tailscale Funnel (with auth)' },
  },
  'gateway.remote.transport': {
    ssh: { zh: 'SSH 隧道连接（默认，最稳定）', en: 'SSH tunnel connection (default, most stable)' },
    direct: { zh: '直接 WebSocket/WSS 连接', en: 'Direct WebSocket/WSS connection' },
  },

  // ── Agents ─────────────────────────────────────────────
  'agents.defaults.model.thinking': {
    off: { zh: '关闭扩展思考', en: 'Disable extended thinking' },
    low: { zh: '简短内部推理', en: 'Brief internal reasoning' },
    medium: { zh: '标准思考量', en: 'Standard thinking budget' },
    high: { zh: '最大思考预算，适合复杂任务', en: 'Maximum thinking budget, for complex tasks' },
    xhigh: { zh: '超高思考预算', en: 'Extra-high thinking budget' },
  },
  'agents.defaults.thinkingDefault': {
    off: { zh: '关闭扩展思考', en: 'Disable extended thinking' },
    low: { zh: '简短内部推理', en: 'Brief internal reasoning' },
    medium: { zh: '标准思考量', en: 'Standard thinking budget' },
    high: { zh: '最大思考预算，适合复杂任务', en: 'Maximum thinking budget, for complex tasks' },
    xhigh: { zh: '超高思考预算', en: 'Extra-high thinking budget' },
  },
  'agents.defaults.timeFormat': {
    auto: { zh: '跟随系统设置（默认）', en: 'Follow system setting (default)' },
    '12': { zh: '12 小时制（AM/PM）', en: '12-hour format (AM/PM)' },
    '24': { zh: '24 小时制', en: '24-hour format' },
  },
  'agents.defaults.typingMode': {
    never: { zh: '不显示输入状态', en: 'Never show typing indicator' },
    instant: { zh: '立即显示输入指示', en: 'Show typing indicator immediately' },
    thinking: { zh: '仅在思考阶段显示', en: 'Show only during thinking phase' },
    message: { zh: '仅在生成消息时显示', en: 'Show only when generating a message' },
  },
  'agents.defaults.blockStreamingDefault': {
    on: { zh: '启用分块流式输出', en: 'Enable block streaming output' },
    off: { zh: '关闭分块流式（默认）', en: 'Disable block streaming (default)' },
  },
  'agents.defaults.blockStreamingBreak': {
    text_end: { zh: '在文本段落结束处断开', en: 'Break at end of text paragraphs' },
    message_end: { zh: '在整条消息结束处断开', en: 'Break at end of entire message' },
  },
  'agents.defaults.verboseDefault': {
    off: { zh: '标准输出模式', en: 'Standard output mode' },
    on: { zh: '详细输出模式，包含更多过程信息', en: 'Verbose mode with more process information' },
  },
  'agents.defaults.elevatedDefault': {
    off: { zh: '标准权限', en: 'Standard privileges' },
    on: { zh: '启用提权访问', en: 'Enable elevated access' },
    ask: { zh: '每次提权前询问用户', en: 'Ask the user before each elevation' },
  },
  'agents.defaults.sandbox.mode': {
    off: { zh: '不使用沙箱，工具直接在宿主机执行', en: 'No sandbox, tools run directly on host' },
    'non-main': { zh: '主智能体无沙箱，其他智能体在 Docker 中运行', en: 'Main agent unsandboxed, others run in Docker' },
    all: { zh: '所有智能体都在 Docker 沙箱中运行', en: 'All agents run in Docker sandbox' },
  },
  'agents.defaults.sandbox.scope': {
    session: { zh: '每个会话独享一个沙箱实例', en: 'Each session gets its own sandbox instance' },
    agent: { zh: '同一智能体的所有会话共享沙箱（默认）', en: 'All sessions of the same agent share a sandbox (default)' },
    shared: { zh: '所有智能体共享单个沙箱', en: 'All agents share a single sandbox' },
  },
  'agents.defaults.sandbox.workspaceAccess': {
    rw: { zh: '可读写工作区目录', en: 'Read-write access to workspace directory' },
    ro: { zh: '只读访问工作区', en: 'Read-only workspace access' },
    none: { zh: '完全无法访问工作区', en: 'No workspace access at all' },
  },
  'agents.defaults.compaction.mode': {
    default: { zh: '标准压缩策略', en: 'Standard compaction strategy' },
    safeguard: { zh: '分块摘要压缩，保留更多上下文', en: 'Chunked summary compaction, preserves more context' },
  },
  'agents.defaults.contextPruning.mode': {
    off: { zh: '不进行上下文裁剪', en: 'No context pruning' },
    'cache-ttl': { zh: '基于 TTL 自动裁剪过期缓存', en: 'Auto-prune expired cache based on TTL' },
  },
  'agents.defaults.heartbeat.target': {
    last: { zh: '发送到最近活跃的渠道', en: 'Send to the most recently active channel' },
    whatsapp: { zh: '发送到 WhatsApp', en: 'Send to WhatsApp' },
    telegram: { zh: '发送到 Telegram', en: 'Send to Telegram' },
    discord: { zh: '发送到 Discord', en: 'Send to Discord' },
    slack: { zh: '发送到 Slack', en: 'Send to Slack' },
    none: { zh: '不发送心跳', en: 'Don\'t send heartbeats' },
  },
  'agents.defaults.humanDelay.mode': {
    off: { zh: '关闭人性化延迟', en: 'Disable human-like delay' },
    natural: { zh: '自然延迟（800-2500ms），模拟人类打字速度', en: 'Natural delay (800-2500ms), simulates human typing speed' },
    custom: { zh: '自定义延迟范围', en: 'Custom delay range' },
  },
  'agents.defaults.sandbox.docker.network': {
    none: { zh: '完全隔离网络（最安全）', en: 'Fully isolated network (most secure)' },
    bridge: { zh: '桥接网络，可访问外部', en: 'Bridge network, can access external resources' },
    host: { zh: '使用宿主机网络', en: 'Use host machine network' },
  },

  // ── Session ────────────────────────────────────────────
  'session.scope': {
    main: { zh: '所有用户共享一个全局会话（不安全，仅测试用）', en: 'All users share a single global session (unsafe, testing only)' },
    'per-sender': { zh: '每个发送者独立会话', en: 'One session per sender' },
    'per-peer': { zh: '同一用户跨渠道共享会话', en: 'Same user shares sessions across channels' },
    'per-channel-peer': { zh: '同一用户 + 同一渠道 = 独立会话（推荐）', en: 'Same user + same channel = isolated session (recommended)' },
    'per-account-channel-peer': { zh: '最细粒度：账号 + 渠道 + 用户 = 独立会话', en: 'Finest granularity: account + channel + user = isolated session' },
  },
  'session.dmScope': {
    main: { zh: '所有 DM 共享主会话，保持对话连续性', en: 'All DMs share the main session, maintaining conversation continuity' },
    'per-peer': { zh: '按发送者隔离 DM 会话', en: 'Isolate DM sessions by sender' },
    'per-channel-peer': { zh: '按渠道+发送者隔离（多用户收件箱推荐）', en: 'Isolate by channel + sender (recommended for multi-user inbox)' },
    'per-account-channel-peer': { zh: '最细粒度：账号+渠道+发送者隔离（多账号推荐）', en: 'Finest granularity: account + channel + sender isolation (recommended for multi-account)' },
  },
  'session.reset.mode': {
    daily: { zh: '每天在指定时间重置会话', en: 'Reset session daily at a specified time' },
    idle: { zh: '在空闲指定时间后自动重置', en: 'Auto-reset after being idle for a specified duration' },
  },
  'session.maintenance.mode': {
    warn: { zh: '会话驱逐时发出警告', en: 'Warn on session eviction' },
    enforce: { zh: '强制执行清理和轮换策略', en: 'Enforce cleanup and rotation policies' },
  },

  // ── Messages ───────────────────────────────────────────
  'messages.queue.mode': {
    collect: { zh: '收集合并：将多条快速消息合并为一次响应（默认）', en: 'Collect: merge multiple rapid messages into one response (default)' },
    steer: { zh: '即时注入：将消息直接注入当前运行（取消待处理的工具调用）', en: 'Steer: inject message into current run (cancels pending tool calls)' },
    followup: { zh: '排队跟进：等当前运行结束后再处理排队的消息', en: 'Follow-up: wait for current run to finish, then process queued messages' },
    'steer-backlog': { zh: '注入+备份：立即注入并保留消息用于后续跟进', en: 'Steer+backlog: inject immediately and keep messages for follow-up' },
    'steer+backlog': { zh: '注入+备份：与 steer-backlog 相同', en: 'Steer+backlog: same as steer-backlog' },
    interrupt: { zh: '中断模式（旧版）：中止当前运行，执行最新消息', en: 'Interrupt (legacy): abort current run, execute latest message' },
    queue: { zh: '队列模式（旧版别名）：等同于 steer 模式', en: 'Queue (legacy alias): equivalent to steer mode' },
  },
  'messages.queue.drop': {
    old: { zh: '丢弃最旧的消息', en: 'Drop the oldest messages' },
    new: { zh: '丢弃最新的消息', en: 'Drop the newest messages' },
    summarize: { zh: '对被丢弃的消息进行摘要', en: 'Summarize dropped messages' },
  },
  'messages.ackReactionScope': {
    'group-mentions': { zh: '仅群聊 @提及（默认）', en: 'Group @mentions only (default)' },
    'group-all': { zh: '所有群聊消息', en: 'All group messages' },
    direct: { zh: '仅私信', en: 'Direct messages only' },
    all: { zh: '所有消息', en: 'All messages' },
  },
  'messages.tts.auto': {
    off: { zh: '关闭自动 TTS', en: 'Disable auto TTS' },
    always: { zh: '所有消息自动转语音', en: 'Auto-convert all messages to speech' },
    inbound: { zh: '仅入站消息转语音', en: 'Convert inbound messages only' },
    tagged: { zh: '仅标记的消息转语音', en: 'Convert tagged messages only' },
  },
  'messages.tts.mode': {
    final: { zh: '仅最终消息转语音', en: 'Convert only final messages to speech' },
    all: { zh: '所有消息（包括中间流式）转语音', en: 'Convert all messages (including intermediate streams) to speech' },
  },
  'messages.tts.provider': {
    elevenlabs: { zh: 'ElevenLabs（高质量多语言）', en: 'ElevenLabs (high quality, multilingual)' },
    openai: { zh: 'OpenAI TTS', en: 'OpenAI TTS' },
  },

  // ── Tools ──────────────────────────────────────────────
  'tools.profile': {
    minimal: { zh: '最小工具集：仅只读操作', en: 'Minimal: read-only operations only' },
    restricted: { zh: '受限工具集：仅只读操作，无命令执行', en: 'Restricted: read-only, no command execution' },
    coding: { zh: '开发工具：文件操作、Shell 执行', en: 'Coding: file operations, shell execution' },
    standard: { zh: '常用工具：文件操作、Web 搜索，无危险命令', en: 'Standard: file ops, web search, no dangerous commands' },
    messaging: { zh: '通信工具：消息发送和管理', en: 'Messaging: message sending and management' },
    advanced: { zh: '扩展工具：包含 Shell 执行和代码运行', en: 'Advanced: includes shell execution and code running' },
    full: { zh: '全部工具开放，仅在可信环境使用', en: 'Full: all tools enabled, use in trusted environments only' },
    unrestricted: { zh: '全部工具开放，无任何限制', en: 'Unrestricted: all tools with no restrictions whatsoever' },
  },
  'tools.sessions.visibility': {
    self: { zh: '仅自己的会话可见', en: 'Only own sessions visible' },
    tree: { zh: '子智能体树中的会话可见（默认）', en: 'Sessions in sub-agent tree visible (default)' },
    agent: { zh: '同一智能体的所有会话可见', en: 'All sessions of the same agent visible' },
    all: { zh: '所有会话均可见', en: 'All sessions visible' },
  },

  // ── Models ─────────────────────────────────────────────
  'models.mode': {
    merge: { zh: '与默认提供商合并（默认），保留内置提供商并添加自定义', en: 'Merge with default providers (default), keep built-in and add custom' },
    replace: { zh: '完全替换默认提供商，仅使用自定义配置', en: 'Fully replace default providers, use only custom config' },
  },
  'models.providers.api': {
    'openai-completions': { zh: 'OpenAI Chat Completions 格式', en: 'OpenAI Chat Completions format' },
    'openai-responses': { zh: 'OpenAI Responses API 格式', en: 'OpenAI Responses API format' },
    'anthropic-messages': { zh: 'Anthropic Messages 格式', en: 'Anthropic Messages format' },
    'google-generative-ai': { zh: 'Google Generative AI 格式', en: 'Google Generative AI format' },
    ollama: { zh: 'Ollama 本地模型', en: 'Ollama local models' },
    'bedrock-converse-stream': { zh: 'AWS Bedrock Converse Stream', en: 'AWS Bedrock Converse Stream' },
  },

  // ── Discovery ──────────────────────────────────────────
  'discovery.mdns.mode': {
    minimal: { zh: '仅广播基本信息（默认），隐藏敏感字段', en: 'Broadcast basic info only (default), hide sensitive fields' },
    full: { zh: '广播完整详情', en: 'Broadcast full details' },
    off: { zh: '禁用 mDNS 服务发现', en: 'Disable mDNS service discovery' },
  },

  // ── Logging ────────────────────────────────────────────
  'logging.level': {
    debug: { zh: '调试级别，输出所有详细信息', en: 'Debug level, output all detailed information' },
    info: { zh: '信息级别（默认）', en: 'Info level (default)' },
    warn: { zh: '仅输出警告和错误', en: 'Warnings and errors only' },
    error: { zh: '仅输出错误', en: 'Errors only' },
  },
  'logging.consoleStyle': {
    pretty: { zh: '格式化彩色输出，适合人类阅读', en: 'Pretty colored output, human-readable' },
    compact: { zh: '简洁紧凑输出', en: 'Compact concise output' },
    json: { zh: 'JSON 格式，适合日志采集系统', en: 'JSON format, suitable for log collection systems' },
  },
  'logging.redactSensitive': {
    off: { zh: '不脱敏，显示所有输出', en: 'No redaction, show all output' },
    tools: { zh: '对工具输出进行敏感信息脱敏', en: 'Redact sensitive information in tool output' },
  },

  // ── Hooks ──────────────────────────────────────────────
  'wakeMode': {
    now: { zh: '立即唤醒智能体处理', en: 'Wake agent immediately for processing' },
    'next-heartbeat': { zh: '等待下一次心跳时处理', en: 'Process on next heartbeat' },
  },

  // ── Channels (generic — fallback matching via lastKey) ──
  'dmPolicy': {
    pairing: { zh: '配对模式：未知用户需先发送配对码验证身份', en: 'Pairing: unknown users must send a pairing code to verify identity' },
    allowlist: { zh: '白名单模式：仅 allowFrom 中的用户可发送 DM', en: 'Allowlist: only users in allowFrom can send DMs' },
    open: { zh: '开放模式：所有用户均可直接发送 DM', en: 'Open: all users can send DMs directly' },
    disabled: { zh: '禁用 DM 功能', en: 'Disable DM functionality' },
  },
  'groupPolicy': {
    allowlist: { zh: '白名单模式：仅配置的群组可触发 Bot（默认）', en: 'Allowlist: only configured groups can trigger the bot (default)' },
    open: { zh: '开放模式：所有群组均可触发', en: 'Open: all groups can trigger the bot' },
    disabled: { zh: '禁用群组消息处理', en: 'Disable group message processing' },
  },
  'streamMode': {
    off: { zh: '不使用流式输出', en: 'No streaming output' },
    partial: { zh: '部分流式：发送中间文本更新', en: 'Partial: send intermediate text updates' },
    block: { zh: '块流式：按段落分块发送', en: 'Block: send in paragraph chunks' },
  },
  'replyToMode': {
    off: { zh: '不回复引用', en: 'Don\'t reply-quote' },
    first: { zh: '回复第一条消息', en: 'Reply to the first message' },
    all: { zh: '回复所有消息', en: 'Reply to all messages' },
  },
  'chunkMode': {
    length: { zh: '按字符数拆分长消息', en: 'Split long messages by character count' },
    newline: { zh: '在换行处拆分消息', en: 'Split messages at newlines' },
  },
  'reactionNotifications': {
    off: { zh: '不发送表情反应通知', en: 'Don\'t send reaction notifications' },
    own: { zh: '仅自己消息的反应', en: 'Reactions on own messages only' },
    all: { zh: '所有消息的反应通知', en: 'Reaction notifications for all messages' },
    allowlist: { zh: '仅白名单用户的反应', en: 'Reactions from allowlisted users only' },
  },
  'chatmode': {
    oncall: { zh: '按需模式：仅响应 @提及', en: 'On-call: respond to @mentions only' },
    onmessage: { zh: '全响应模式：响应每条消息', en: 'On-message: respond to every message' },
    onchar: { zh: '前缀模式：响应以指定字符开头的消息', en: 'On-char: respond to messages starting with a specific character' },
  },
  'breakPreference': {
    paragraph: { zh: '在段落边界处断开', en: 'Break at paragraph boundaries' },
    newline: { zh: '在换行符处断开', en: 'Break at newlines' },
    sentence: { zh: '在句子边界处断开', en: 'Break at sentence boundaries' },
  },
  'historyScope': {
    thread: { zh: '按线程独立记录历史（默认）', en: 'Record history per thread (default)' },
    channel: { zh: '整个频道共享历史记录', en: 'Entire channel shares history' },
  },

  // ── Commands ───────────────────────────────────────────
  'commands.native': {
    auto: { zh: '自动启用（在支持的平台）', en: 'Auto-enable on supported platforms' },
    true: { zh: '强制启用', en: 'Force enable' },
    false: { zh: '禁用', en: 'Disable' },
  },
}

// ─── Deprecated / Alias Enum Values ─────────────────────────────────
// Options still in OpenClaw's schema for backward compatibility but superseded
// by newer equivalents. The UI dims these and sorts them to the end.

const DEPRECATED_ENUM_OPTIONS: Record<string, Set<string>> = {
  'messages.queue.mode': new Set(['steer+backlog', 'queue', 'interrupt']),
}

/** Check if an enum option is deprecated/alias for a given path */
export function isDeprecatedEnumOption(path: string, value: string): boolean {
  return DEPRECATED_ENUM_OPTIONS[path]?.has(value) ?? false
}

// ─── Field-Level Knowledge ───────────────────────────────────────────
// Supplements uiHint.help when the schema's built-in help is insufficient.
// Key is the full dot-path, value is bilingual description.

export const FIELD_KNOWLEDGE: Record<string, BiText> = {
  // ── Gateway ────────────────────────────────────────────
  'gateway.mode': { zh: '控制网关是在本地运行还是连接远程实例', en: 'Control whether the gateway runs locally or connects to a remote instance' },
  'gateway.port': { zh: '网关监听端口，默认 18789，范围 1024-65535', en: 'Gateway listening port, default 18789, range 1024-65535' },
  'gateway.bind': { zh: '网络绑定地址，非回环绑定时需要配置认证', en: 'Network bind address — authentication required for non-loopback bindings' },
  'gateway.auth': { zh: '客户端认证方式，非 loopback 绑定时强制启用', en: 'Client authentication — required when not using loopback binding' },
  'gateway.auth.mode': { zh: '选择认证方式，影响客户端如何连接', en: 'Choose authentication method, affects how clients connect' },
  'gateway.auth.token': { zh: '共享密钥令牌，建议使用环境变量 ${TOKEN}', en: 'Shared secret token, recommend using env var ${TOKEN}' },
  'gateway.auth.password': { zh: '密码认证时的密码', en: 'Password for password authentication' },
  'gateway.auth.allowTailscale': { zh: '是否允许 Tailscale 认证的客户端', en: 'Whether to allow Tailscale-authenticated clients' },
  'gateway.auth.rateLimit': { zh: '认证速率限制配置', en: 'Authentication rate limiting configuration' },
  'gateway.auth.rateLimit.maxAttempts': { zh: '限流窗口内最大认证尝试次数，默认 10', en: 'Max auth attempts within rate limit window, default 10' },
  'gateway.auth.rateLimit.windowMs': { zh: '限流窗口时长（毫秒），默认 60000', en: 'Rate limit window duration (ms), default 60000' },
  'gateway.auth.rateLimit.lockoutMs': { zh: '超出限制后的锁定时长（毫秒），默认 300000', en: 'Lockout duration after exceeding limit (ms), default 300000' },
  'gateway.auth.rateLimit.exemptLoopback': { zh: '是否豁免本机连接的限流，默认 true', en: 'Whether to exempt loopback connections from rate limiting, default true' },
  'gateway.reload': { zh: '配置变更时的重载设置', en: 'Reload settings for configuration changes' },
  'gateway.reload.mode': { zh: '配置变更时的重载策略', en: 'Reload strategy for configuration changes' },
  'gateway.reload.debounceMs': { zh: '重载防抖时间（毫秒），防止频繁重启，默认 300', en: 'Reload debounce time (ms), prevents frequent restarts, default 300' },
  'gateway.tailscale': { zh: 'Tailscale VPN 集成，实现安全的远程访问', en: 'Tailscale VPN integration for secure remote access' },
  'gateway.tailscale.mode': { zh: 'Tailscale 集成模式', en: 'Tailscale integration mode' },
  'gateway.tailscale.resetOnExit': { zh: '网关退出时是否重置 Tailscale 配置', en: 'Whether to reset Tailscale config when gateway exits' },
  'gateway.controlUi': { zh: '内置 Web 管理界面设置', en: 'Built-in web management UI settings' },
  'gateway.controlUi.enabled': { zh: '是否启用 Control UI 管理界面，默认 true', en: 'Enable Control UI management interface, default true' },
  'gateway.controlUi.basePath': { zh: '管理界面基础路径，默认 /openclaw', en: 'Management UI base path, default /openclaw' },
  'gateway.controlUi.root': { zh: '自定义 UI 根目录路径', en: 'Custom UI root directory path' },
  'gateway.controlUi.allowInsecureAuth': { zh: '是否允许不安全的认证方式', en: 'Whether to allow insecure authentication methods' },
  'gateway.remote': { zh: '远程网关连接配置', en: 'Remote gateway connection configuration' },
  'gateway.remote.url': { zh: '远程网关的 URL 地址', en: 'Remote gateway URL' },
  'gateway.remote.transport': { zh: '远程连接方式：SSH 或直连', en: 'Remote connection method: SSH or direct' },
  'gateway.remote.token': { zh: '远程认证令牌', en: 'Remote authentication token' },
  'gateway.remote.password': { zh: '远程认证密码', en: 'Remote authentication password' },
  'gateway.trustedProxies': { zh: '受信任代理 IP 列表，用于正确获取客户端真实 IP', en: 'Trusted proxy IP list for obtaining the client\'s real IP' },
  'gateway.tools': { zh: 'HTTP 端点的工具访问限制', en: 'Tool access restrictions for HTTP endpoints' },
  'gateway.tools.deny': { zh: '通过 HTTP 端点禁止的工具列表', en: 'Tools denied via HTTP endpoints' },
  'gateway.tools.allow': { zh: '覆盖拒绝列表的工具白名单', en: 'Tool allowlist overriding the deny list' },
  'gateway.http': { zh: 'OpenAI 兼容 API 端点配置', en: 'OpenAI-compatible API endpoint configuration' },
  'gateway.http.endpoints': { zh: 'HTTP API 端点设置', en: 'HTTP API endpoint settings' },

  // ── Agents ─────────────────────────────────────────────
  'agents.defaults': { zh: '所有智能体继承的全局默认配置，单个智能体可覆盖', en: 'Global defaults inherited by all agents, individual agents can override' },
  'agents.defaults.workspace': { zh: '默认工作区路径，如 ~/.openclaw/workspace', en: 'Default workspace path, e.g. ~/.openclaw/workspace' },
  'agents.defaults.repoRoot': { zh: '用于系统提示的仓库根路径', en: 'Repository root path used in system prompts' },
  'agents.defaults.skipBootstrap': { zh: '跳过引导文件创建，默认 false', en: 'Skip bootstrap file creation, default false' },
  'agents.defaults.bootstrapMaxChars': { zh: '每个引导文件的最大字符数，默认 20000', en: 'Max characters per bootstrap file, default 20000' },
  'agents.defaults.bootstrapTotalMaxChars': { zh: '所有引导文件的总最大字符数，默认 150000', en: 'Total max characters for all bootstrap files, default 150000' },
  'agents.defaults.imageMaxDimensionPx': { zh: '图像最大尺寸（像素），超过会自动缩放，默认 1200', en: 'Max image dimension (px), auto-scaled if exceeded, default 1200' },
  'agents.defaults.userTimezone': { zh: '系统提示中使用的时区，如 Asia/Shanghai', en: 'Timezone used in system prompts, e.g. Asia/Shanghai' },
  'agents.defaults.model': { zh: '模型配置：主模型、备选模型和别名', en: 'Model config: primary model, fallbacks, and aliases' },
  'agents.defaults.model.primary': { zh: '主模型，格式为 provider/model，如 anthropic/claude-sonnet-4-5', en: 'Primary model in provider/model format, e.g. anthropic/claude-sonnet-4-5' },
  'agents.defaults.model.fallbacks': { zh: '主模型不可用时的备选模型列表', en: 'Fallback model list when the primary model is unavailable' },
  'agents.defaults.model.models': { zh: '模型别名字典，可用短名称引用模型（也作为白名单）', en: 'Model alias dictionary — short names for models (also acts as allowlist)' },
  'agents.defaults.model.thinking': { zh: '扩展思考模式，越高推理越深入但更慢', en: 'Extended thinking mode — higher means deeper reasoning but slower' },
  'agents.defaults.imageModel': { zh: '图像生成模型配置', en: 'Image generation model configuration' },
  'agents.defaults.imageModel.primary': { zh: '主图像模型，格式为 provider/model', en: 'Primary image model in provider/model format' },
  'agents.defaults.imageModel.fallbacks': { zh: '图像模型不可用时的备选列表', en: 'Fallback list when the image model is unavailable' },
  'agents.defaults.thinkingDefault': { zh: '默认思考级别', en: 'Default thinking level' },
  'agents.defaults.verboseDefault': { zh: '是否默认启用详细输出', en: 'Whether verbose output is enabled by default' },
  'agents.defaults.elevatedDefault': { zh: '是否默认启用提权访问', en: 'Whether elevated access is enabled by default' },
  'agents.defaults.timeFormat': { zh: '时间显示格式', en: 'Time display format' },
  'agents.defaults.timeoutSeconds': { zh: '模型请求超时秒数，默认 600', en: 'Model request timeout in seconds, default 600' },
  'agents.defaults.mediaMaxMb': { zh: '最大媒体文件大小（MB），默认 5', en: 'Max media file size (MB), default 5' },
  'agents.defaults.contextTokens': { zh: '上下文窗口大小（token 数），默认 200000', en: 'Context window size (tokens), default 200000' },
  'agents.defaults.maxConcurrent': { zh: '跨会话并行运行的最大数量，默认 1', en: 'Max concurrent runs across sessions, default 1' },
  'agents.defaults.typingMode': { zh: '何时显示"正在输入"指示器', en: 'When to show the "typing" indicator' },
  'agents.defaults.typingIntervalSeconds': { zh: '输入指示器刷新间隔（秒），默认 6', en: 'Typing indicator refresh interval (seconds), default 6' },
  'agents.defaults.blockStreamingDefault': { zh: '是否启用分块流式输出（大段文字分块发送）', en: 'Enable block streaming output (send large text in chunks)' },
  'agents.defaults.blockStreamingBreak': { zh: '分块流式的断开策略', en: 'Block streaming break strategy' },
  'agents.defaults.blockStreamingChunk': { zh: '分块流式的字符数配置', en: 'Block streaming character count configuration' },
  'agents.defaults.blockStreamingChunk.minChars': { zh: '每块最小字符数，默认 800', en: 'Min characters per chunk, default 800' },
  'agents.defaults.blockStreamingChunk.maxChars': { zh: '每块最大字符数，默认 1200', en: 'Max characters per chunk, default 1200' },
  'agents.defaults.blockStreamingCoalesce': { zh: '分块合并配置', en: 'Block coalescing configuration' },
  'agents.defaults.blockStreamingCoalesce.idleMs': { zh: '合并空闲等待时间（毫秒），默认 1000', en: 'Coalesce idle wait time (ms), default 1000' },
  'agents.defaults.humanDelay': { zh: '人性化延迟配置，模拟人类打字速度', en: 'Human-like delay configuration — simulates human typing speed' },
  'agents.defaults.humanDelay.mode': { zh: '延迟模式：关闭、自然或自定义', en: 'Delay mode: off, natural, or custom' },
  'agents.defaults.humanDelay.minMs': { zh: '自定义延迟最小值（毫秒）', en: 'Custom delay minimum (ms)' },
  'agents.defaults.humanDelay.maxMs': { zh: '自定义延迟最大值（毫秒）', en: 'Custom delay maximum (ms)' },
  'agents.defaults.compaction': { zh: '会话压缩配置，当上下文过长时自动摘要', en: 'Session compaction — auto-summarize when context gets too long' },
  'agents.defaults.compaction.mode': { zh: '压缩策略模式', en: 'Compaction strategy mode' },
  'agents.defaults.compaction.reserveTokensFloor': { zh: '压缩后保留的最少 token 数，默认 24000', en: 'Minimum tokens to keep after compaction, default 24000' },
  'agents.defaults.compaction.memoryFlush': { zh: '记忆刷新配置', en: 'Memory flush configuration' },
  'agents.defaults.compaction.memoryFlush.enabled': { zh: '是否启用记忆刷新，默认 true', en: 'Enable memory flush, default true' },
  'agents.defaults.compaction.memoryFlush.softThresholdTokens': { zh: '触发刷新的 token 阈值，默认 6000', en: 'Token threshold to trigger flush, default 6000' },
  'agents.defaults.compaction.memoryFlush.systemPrompt': { zh: '记忆刷新使用的系统提示', en: 'System prompt used for memory flush' },
  'agents.defaults.compaction.memoryFlush.prompt': { zh: '记忆刷新使用的提示内容', en: 'Prompt content used for memory flush' },
  'agents.defaults.contextPruning': { zh: '上下文裁剪设置，自动清理过期工具结果', en: 'Context pruning — auto-clean expired tool results' },
  'agents.defaults.contextPruning.mode': { zh: '裁剪模式', en: 'Pruning mode' },
  'agents.defaults.contextPruning.ttl': { zh: '缓存 TTL 时长，如 1h，超过后可被裁剪', en: 'Cache TTL duration, e.g. 1h, pruneable after expiry' },
  'agents.defaults.contextPruning.keepLastAssistants': { zh: '保留最近 N 条助手消息不被裁剪，默认 3', en: 'Keep last N assistant messages from pruning, default 3' },
  'agents.defaults.contextPruning.softTrimRatio': { zh: '软裁剪触发比例（0-1），默认 0.3', en: 'Soft trim trigger ratio (0-1), default 0.3' },
  'agents.defaults.contextPruning.hardClearRatio': { zh: '硬清除触发比例（0-1），默认 0.5', en: 'Hard clear trigger ratio (0-1), default 0.5' },
  'agents.defaults.contextPruning.minPrunableToolChars': { zh: '可裁剪工具结果的最小字符数，默认 50000', en: 'Min characters in pruneable tool results, default 50000' },
  'agents.defaults.contextPruning.softTrim': { zh: '软裁剪参数', en: 'Soft trim parameters' },
  'agents.defaults.contextPruning.softTrim.maxChars': { zh: '软裁剪后保留的最大字符数，默认 4000', en: 'Max characters to keep after soft trim, default 4000' },
  'agents.defaults.contextPruning.softTrim.headChars': { zh: '保留内容头部字符数，默认 1500', en: 'Characters to keep from content head, default 1500' },
  'agents.defaults.contextPruning.softTrim.tailChars': { zh: '保留内容尾部字符数，默认 1500', en: 'Characters to keep from content tail, default 1500' },
  'agents.defaults.contextPruning.hardClear': { zh: '硬清除参数', en: 'Hard clear parameters' },
  'agents.defaults.contextPruning.hardClear.enabled': { zh: '是否启用硬清除，默认 true', en: 'Enable hard clear, default true' },
  'agents.defaults.contextPruning.hardClear.placeholder': { zh: '清除后的占位符文本', en: 'Placeholder text after clearing' },
  'agents.defaults.contextPruning.tools': { zh: '裁剪工具设置', en: 'Pruning tool settings' },
  'agents.defaults.contextPruning.tools.deny': { zh: '排除裁剪的工具列表', en: 'Tools excluded from pruning' },
  'agents.defaults.sandbox': { zh: '沙箱配置，控制工具执行的隔离级别', en: 'Sandbox configuration — controls tool execution isolation level' },
  'agents.defaults.sandbox.mode': { zh: '沙箱模式，决定是否使用 Docker 隔离', en: 'Sandbox mode — whether to use Docker isolation' },
  'agents.defaults.sandbox.scope': { zh: '沙箱共享范围', en: 'Sandbox sharing scope' },
  'agents.defaults.sandbox.workspaceAccess': { zh: '沙箱中的工作区访问权限', en: 'Workspace access level inside sandbox' },
  'agents.defaults.sandbox.workspaceRoot': { zh: '沙箱根目录，默认 ~/.openclaw/sandboxes', en: 'Sandbox root directory, default ~/.openclaw/sandboxes' },
  'agents.defaults.sandbox.docker': { zh: 'Docker 沙箱容器配置', en: 'Docker sandbox container configuration' },
  'agents.defaults.sandbox.docker.image': { zh: 'Docker 镜像，默认 openclaw-sandbox:bookworm-slim', en: 'Docker image, default openclaw-sandbox:bookworm-slim' },
  'agents.defaults.sandbox.docker.containerPrefix': { zh: '容器名称前缀，默认 openclaw-sbx-', en: 'Container name prefix, default openclaw-sbx-' },
  'agents.defaults.sandbox.docker.workdir': { zh: '容器内工作目录，默认 /workspace', en: 'Working directory inside container, default /workspace' },
  'agents.defaults.sandbox.docker.readOnlyRoot': { zh: '只读根文件系统，提高安全性，默认 true', en: 'Read-only root filesystem for improved security, default true' },
  'agents.defaults.sandbox.docker.tmpfs': { zh: 'tmpfs 挂载点列表，如 /tmp', en: 'tmpfs mount points, e.g. /tmp' },
  'agents.defaults.sandbox.docker.network': { zh: '网络模式：none=隔离，bridge=桥接，host=宿主机', en: 'Network mode: none=isolated, bridge=bridged, host=host machine' },
  'agents.defaults.sandbox.docker.user': { zh: '容器运行用户，默认 1000:1000', en: 'Container user, default 1000:1000' },
  'agents.defaults.sandbox.docker.capDrop': { zh: '移除的 Linux capabilities 列表', en: 'Linux capabilities to drop' },
  'agents.defaults.sandbox.docker.env': { zh: '传递给容器的环境变量', en: 'Environment variables passed to the container' },
  'agents.defaults.sandbox.docker.setupCommand': { zh: '容器启动后执行的初始化命令', en: 'Initialization command to run after container starts' },
  'agents.defaults.sandbox.docker.pidsLimit': { zh: '最大进程数限制，默认 256', en: 'Max process count limit, default 256' },
  'agents.defaults.sandbox.docker.memory': { zh: '内存限制，如 512m、1g，默认 1g', en: 'Memory limit, e.g. 512m, 1g, default 1g' },
  'agents.defaults.sandbox.docker.memorySwap': { zh: '内存+交换限制，默认 2g', en: 'Memory + swap limit, default 2g' },
  'agents.defaults.sandbox.docker.cpus': { zh: 'CPU 核心数限制，默认 1', en: 'CPU core limit, default 1' },
  'agents.defaults.sandbox.docker.seccompProfile': { zh: 'Seccomp 安全配置文件路径', en: 'Seccomp security profile path' },
  'agents.defaults.sandbox.docker.apparmorProfile': { zh: 'AppArmor 安全配置，默认 openclaw-sandbox', en: 'AppArmor security profile, default openclaw-sandbox' },
  'agents.defaults.sandbox.docker.dns': { zh: '自定义 DNS 服务器列表', en: 'Custom DNS server list' },
  'agents.defaults.sandbox.docker.extraHosts': { zh: '额外 hosts 条目，格式 host:ip', en: 'Extra hosts entries in host:ip format' },
  'agents.defaults.sandbox.docker.binds': { zh: '卷绑定挂载列表', en: 'Volume bind mount list' },
  'agents.defaults.sandbox.browser': { zh: '沙箱中的浏览器配置', en: 'Browser configuration inside sandbox' },
  'agents.defaults.sandbox.browser.enabled': { zh: '是否启用沙箱浏览器，默认 false', en: 'Enable sandbox browser, default false' },
  'agents.defaults.sandbox.browser.image': { zh: '浏览器容器镜像', en: 'Browser container image' },
  'agents.defaults.sandbox.browser.cdpPort': { zh: 'Chrome DevTools Protocol 端口，默认 9222', en: 'Chrome DevTools Protocol port, default 9222' },
  'agents.defaults.sandbox.browser.vncPort': { zh: 'VNC 端口，默认 5900', en: 'VNC port, default 5900' },
  'agents.defaults.sandbox.browser.noVncPort': { zh: 'noVNC Web 端口，默认 6080', en: 'noVNC web port, default 6080' },
  'agents.defaults.sandbox.browser.headless': { zh: '是否以无头模式运行，默认 false', en: 'Run in headless mode, default false' },
  'agents.defaults.sandbox.browser.enableNoVnc': { zh: '是否启用 noVNC Web 界面，默认 true', en: 'Enable noVNC web interface, default true' },
  'agents.defaults.sandbox.browser.allowHostControl': { zh: '是否允许宿主机控制浏览器，默认 false', en: 'Allow host to control the browser, default false' },
  'agents.defaults.sandbox.browser.autoStart': { zh: '是否自动启动浏览器，默认 true', en: 'Auto-start browser, default true' },
  'agents.defaults.sandbox.browser.autoStartTimeoutMs': { zh: '自动启动超时（毫秒），默认 12000', en: 'Auto-start timeout (ms), default 12000' },
  'agents.defaults.sandbox.prune': { zh: '沙箱容器清理策略', en: 'Sandbox container cleanup policy' },
  'agents.defaults.sandbox.prune.idleHours': { zh: '空闲容器清理时间（小时），默认 24', en: 'Idle container cleanup time (hours), default 24' },
  'agents.defaults.sandbox.prune.maxAgeDays': { zh: '容器最大存活天数，默认 7', en: 'Max container age (days), default 7' },
  'agents.defaults.heartbeat': { zh: '心跳消息设置，定期向渠道发送状态', en: 'Heartbeat messages — send periodic status to channels' },
  'agents.defaults.heartbeat.every': { zh: '心跳间隔，如 30m、2h，设为 0m 禁用', en: 'Heartbeat interval, e.g. 30m, 2h, set to 0m to disable' },
  'agents.defaults.heartbeat.model': { zh: '心跳使用的模型（可覆盖主模型）', en: 'Model used for heartbeats (can override primary model)' },
  'agents.defaults.heartbeat.includeReasoning': { zh: '心跳是否包含扩展推理，默认 false', en: 'Include extended reasoning in heartbeats, default false' },
  'agents.defaults.heartbeat.session': { zh: '心跳使用的会话键，默认 main', en: 'Session key for heartbeats, default main' },
  'agents.defaults.heartbeat.to': { zh: '心跳投递目标', en: 'Heartbeat delivery target' },
  'agents.defaults.heartbeat.target': { zh: '心跳消息发送的目标渠道', en: 'Target channel for heartbeat messages' },
  'agents.defaults.heartbeat.prompt': { zh: '心跳提示内容', en: 'Heartbeat prompt content' },
  'agents.defaults.heartbeat.ackMaxChars': { zh: '心跳确认最大字符数，默认 300', en: 'Max characters for heartbeat acknowledgment, default 300' },
  'agents.defaults.heartbeat.suppressToolErrorWarnings': { zh: '抑制工具错误警告，默认 false', en: 'Suppress tool error warnings, default false' },
  'agents.defaults.memorySearch': { zh: '向量记忆搜索配置', en: 'Vector memory search configuration' },
  'agents.defaults.memorySearch.enabled': { zh: '是否启用向量记忆搜索', en: 'Enable vector memory search' },
  'agents.defaults.memorySearch.provider': { zh: '嵌入向量提供商，自动选择 local/openai/gemini/voyage', en: 'Embedding provider, auto-selects from local/openai/gemini/voyage' },
  'agents.defaults.memorySearch.minScore': { zh: '搜索结果最低分数阈值，默认 0.35', en: 'Minimum score threshold for search results, default 0.35' },
  'agents.defaults.memorySearch.maxResults': { zh: '搜索返回的最大结果数，默认 6', en: 'Max results returned by search, default 6' },
  'agents.defaults.subagents': { zh: '子智能体配置', en: 'Sub-agent configuration' },
  'agents.defaults.subagents.allowAgents': { zh: '允许生成的子智能体 ID 列表，["*"] 表示允许所有', en: 'Allowed sub-agent IDs, ["*"] means allow all' },
  'agents.defaults.subagents.maxSpawnDepth': { zh: '子智能体最大嵌套深度，默认 1', en: 'Max sub-agent nesting depth, default 1' },
  'agents.list': { zh: '智能体列表，每个条目继承 defaults 并可覆盖', en: 'Agent list — each entry inherits defaults and can override' },

  // ── Models / Providers ─────────────────────────────────
  'models.mode': { zh: '模型模式：merge=与默认合并，replace=完全替换', en: 'Model mode: merge=merge with defaults, replace=fully replace' },
  'models.providers': { zh: 'AI 提供商目录，每个条目包含 API 密钥和端点', en: 'AI provider catalog — each entry contains API key and endpoints' },

  // ── Session ────────────────────────────────────────────
  'session.scope': { zh: '群聊会话隔离策略', en: 'Group chat session isolation policy' },
  'session.dmScope': { zh: 'DM（私信）会话隔离策略', en: 'DM (direct message) session isolation policy' },
  'session.identityLinks': { zh: '身份关联规则，用于跨渠道识别同一用户', en: 'Identity link rules for cross-channel user identification' },
  'session.reset': { zh: '会话自动重置设置', en: 'Session auto-reset settings' },
  'session.reset.mode': { zh: '重置触发模式', en: 'Reset trigger mode' },
  'session.reset.atHour': { zh: '每日重置的小时 (0-23)，配合 daily 模式', en: 'Hour of daily reset (0-23), used with daily mode' },
  'session.reset.idleMinutes': { zh: '空闲多少分钟后自动重置', en: 'Auto-reset after idle for this many minutes' },
  'session.reset.timezone': { zh: '重置时间使用的时区', en: 'Timezone for reset timing' },
  'session.resetByType': { zh: '按会话类型设置不同的重置策略', en: 'Set different reset policies by session type' },
  'session.resetByType.thread': { zh: '线程会话的专用重置策略', en: 'Thread session reset policy' },
  'session.resetByType.direct': { zh: '私聊会话的重置策略', en: 'Direct message session reset policy' },
  'session.resetByType.group': { zh: '群聊会话的重置策略', en: 'Group chat session reset policy' },
  'session.resetTriggers': { zh: '触发会话重置的自定义命令列表', en: 'Custom commands that trigger session reset' },
  'session.store': { zh: '会话存储后端配置', en: 'Session storage backend configuration' },
  'session.mainKey': { zh: '主会话键标识符，默认 main', en: 'Main session key identifier, default main' },
  'session.maintenance': { zh: '会话维护策略：清理、轮换和驱逐', en: 'Session maintenance: cleanup, rotation, and eviction' },
  'session.maintenance.mode': { zh: '维护执行模式', en: 'Maintenance execution mode' },
  'session.maintenance.pruneAfter': { zh: '会话保留时长，如 30d，超过后可清理', en: 'Session retention duration, e.g. 30d, pruneable after expiry' },
  'session.maintenance.maxEntries': { zh: '最大会话条目数，默认 500', en: 'Max session entries, default 500' },
  'session.maintenance.rotateBytes': { zh: '日志轮换阈值，如 10mb', en: 'Log rotation threshold, e.g. 10mb' },
  'session.sendPolicy': { zh: '消息发送策略规则列表', en: 'Message send policy rule list' },
  'session.sendPolicy.rules': { zh: '发送策略规则数组', en: 'Send policy rules array' },
  'session.sendPolicy.default': { zh: '默认策略：allow 或 deny', en: 'Default policy: allow or deny' },
  'session.agentToAgent': { zh: '智能体之间的会话交互配置', en: 'Inter-agent session interaction configuration' },
  'session.agentToAgent.maxPingPongTurns': { zh: '智能体间最大对话轮次，默认 5', en: 'Max conversation turns between agents, default 5' },

  // ── Messages ───────────────────────────────────────────
  'messages.responsePrefix': { zh: '响应消息的前缀格式，支持 {model} 等变量', en: 'Response message prefix format, supports {model} and other variables' },
  'messages.messagePrefix': { zh: '接收消息的前缀格式', en: 'Inbound message prefix format' },
  'messages.ackReaction': { zh: '收到消息时的自动表情反应，如 👀 🤔', en: 'Auto emoji reaction when a message is received, e.g. 👀 🤔' },
  'messages.ackReactionScope': { zh: '自动反应的适用范围', en: 'Scope for automatic reactions' },
  'messages.removeAckAfterReply': { zh: '回复后是否自动移除确认反应', en: 'Whether to remove acknowledgment reaction after replying' },
  'messages.queue': { zh: '消息队列策略，控制同时收到多条消息时的处理方式', en: 'Message queue strategy — controls handling when multiple messages arrive' },
  'messages.queue.mode': { zh: '队列模式 — 决定新消息如何与当前运行交互', en: 'Queue mode — determines how new messages interact with the current run' },
  'messages.queue.debounceMs': { zh: '消息合并防抖延迟（毫秒），默认 1000', en: 'Message merge debounce delay (ms), default 1000' },
  'messages.queue.cap': { zh: '队列最大消息数，默认 20', en: 'Max messages in queue, default 20' },
  'messages.queue.drop': { zh: '当队列溢出时如何处理多余的消息', en: 'How to handle excess messages when queue overflows' },
  'messages.queue.byChannel': { zh: '按渠道覆盖队列设置', en: 'Per-channel queue overrides' },
  'messages.inbound': { zh: '入站消息处理设置', en: 'Inbound message processing settings' },
  'messages.inbound.debounceMs': { zh: '入站消息防抖毫秒数，默认 2000，合并快速连续消息', en: 'Inbound message debounce (ms), default 2000, merges rapid consecutive messages' },
  'messages.inbound.byChannel': { zh: '按渠道覆盖入站设置', en: 'Per-channel inbound overrides' },
  'messages.groupChat': { zh: '群聊相关设置', en: 'Group chat settings' },
  'messages.groupChat.historyLimit': { zh: '群聊历史消息保留数量', en: 'Number of group chat history messages to retain' },
  'messages.tts': { zh: '文字转语音配置', en: 'Text-to-speech configuration' },
  'messages.tts.auto': { zh: '自动 TTS 触发条件', en: 'Auto TTS trigger condition' },
  'messages.tts.mode': { zh: 'TTS 转换范围', en: 'TTS conversion scope' },
  'messages.tts.provider': { zh: 'TTS 提供商选择', en: 'TTS provider selection' },
  'messages.tts.summaryModel': { zh: 'TTS 摘要使用的模型', en: 'Model used for TTS summaries' },
  'messages.tts.maxTextLength': { zh: '最大 TTS 文本长度，默认 4000', en: 'Max TTS text length, default 4000' },
  'messages.tts.timeoutMs': { zh: 'TTS 请求超时（毫秒），默认 30000', en: 'TTS request timeout (ms), default 30000' },
  'messages.tts.elevenlabs': { zh: 'ElevenLabs TTS 配置', en: 'ElevenLabs TTS configuration' },
  'messages.tts.openai': { zh: 'OpenAI TTS 配置', en: 'OpenAI TTS configuration' },

  // ── Tools ──────────────────────────────────────────────
  'tools.profile': { zh: '工具权限预设，控制智能体可用工具范围', en: 'Tool permission preset — controls the range of tools available to agents' },
  'tools.allow': { zh: '额外允许的工具列表（大小写不敏感）', en: 'Extra allowed tools list (case-insensitive)' },
  'tools.deny': { zh: '明确禁止的工具列表（覆盖 allow）', en: 'Explicitly denied tools list (overrides allow)' },
  'tools.byProvider': { zh: '按模型提供商自定义工具权限', en: 'Custom tool permissions by model provider' },
  'tools.elevated': { zh: '允许以提权方式运行的工具和来源', en: 'Tools and sources allowed to run with elevated privileges' },
  'tools.elevated.enabled': { zh: '是否允许提权执行，默认 true', en: 'Allow elevated execution, default true' },
  'tools.elevated.allowFrom': { zh: '按渠道设定提权白名单', en: 'Elevation allowlist by channel' },
  'tools.exec': { zh: '命令执行设置：后台任务、超时、补丁应用', en: 'Command execution: background tasks, timeouts, patch application' },
  'tools.exec.backgroundMs': { zh: '后台任务阈值（毫秒），默认 10000', en: 'Background task threshold (ms), default 10000' },
  'tools.exec.timeoutSec': { zh: '命令执行超时（秒），默认 1800', en: 'Command execution timeout (seconds), default 1800' },
  'tools.exec.cleanupMs': { zh: '进程清理时间（毫秒），默认 1800000', en: 'Process cleanup time (ms), default 1800000' },
  'tools.exec.notifyOnExit': { zh: '后台进程退出时是否通知，默认 true', en: 'Notify when background process exits, default true' },
  'tools.exec.applyPatch': { zh: '补丁应用设置', en: 'Patch application settings' },
  'tools.exec.applyPatch.enabled': { zh: '是否启用补丁应用，默认 false', en: 'Enable patch application, default false' },
  'tools.exec.applyPatch.allowModels': { zh: '允许使用补丁的模型列表', en: 'Models allowed to use patch application' },
  'tools.loopDetection': { zh: '检测并防止智能体陷入工具调用死循环', en: 'Detect and prevent agents from getting stuck in tool-call loops' },
  'tools.loopDetection.enabled': { zh: '是否启用循环检测，默认 false', en: 'Enable loop detection, default false' },
  'tools.loopDetection.historySize': { zh: '工具调用历史大小，默认 30', en: 'Tool call history size, default 30' },
  'tools.loopDetection.warningThreshold': { zh: '警告阈值，默认 10', en: 'Warning threshold, default 10' },
  'tools.loopDetection.criticalThreshold': { zh: '严重阈值，默认 20', en: 'Critical threshold, default 20' },
  'tools.loopDetection.globalCircuitBreakerThreshold': { zh: '全局断路器阈值，默认 30', en: 'Global circuit breaker threshold, default 30' },
  'tools.loopDetection.detectors': { zh: '循环检测器开关', en: 'Loop detector toggles' },
  'tools.loopDetection.detectors.genericRepeat': { zh: '检测重复调用相同工具+参数，默认 true', en: 'Detect repeated calls with same tool+args, default true' },
  'tools.loopDetection.detectors.knownPollNoProgress': { zh: '检测轮询无进展循环，默认 true', en: 'Detect polling loops with no progress, default true' },
  'tools.loopDetection.detectors.pingPong': { zh: '检测 A/B 乒乓循环，默认 true', en: 'Detect A/B ping-pong loops, default true' },
  'tools.web': { zh: 'Web 工具配置：搜索引擎、网页抓取', en: 'Web tools: search engines, web scraping' },
  'tools.web.search': { zh: 'Web 搜索配置', en: 'Web search configuration' },
  'tools.web.search.enabled': { zh: '是否启用 Web 搜索，默认 true', en: 'Enable web search, default true' },
  'tools.web.search.apiKey': { zh: '搜索引擎 API 密钥（如 Brave Search）', en: 'Search engine API key (e.g. Brave Search)' },
  'tools.web.search.maxResults': { zh: '最大搜索结果数，默认 5', en: 'Max search results, default 5' },
  'tools.web.search.timeoutSeconds': { zh: '搜索超时（秒），默认 30', en: 'Search timeout (seconds), default 30' },
  'tools.web.search.cacheTtlMinutes': { zh: '搜索缓存时长（分钟），默认 15', en: 'Search cache TTL (minutes), default 15' },
  'tools.web.fetch': { zh: '网页抓取配置', en: 'Web fetch configuration' },
  'tools.web.fetch.enabled': { zh: '是否启用网页抓取，默认 true', en: 'Enable web fetching, default true' },
  'tools.web.fetch.maxChars': { zh: '最大响应字符数，默认 50000', en: 'Max response characters, default 50000' },
  'tools.web.fetch.timeoutSeconds': { zh: '抓取超时（秒），默认 30', en: 'Fetch timeout (seconds), default 30' },
  'tools.web.fetch.cacheTtlMinutes': { zh: '抓取缓存时长（分钟），默认 15', en: 'Fetch cache TTL (minutes), default 15' },
  'tools.web.fetch.userAgent': { zh: '自定义 User-Agent 字符串', en: 'Custom User-Agent string' },
  'tools.media': { zh: '媒体处理工具：音频、视频、图像模型', en: 'Media processing tools: audio, video, image models' },
  'tools.media.concurrency': { zh: '媒体处理并发数，默认 2', en: 'Media processing concurrency, default 2' },
  'tools.media.audio': { zh: '音频处理配置', en: 'Audio processing configuration' },
  'tools.media.audio.enabled': { zh: '是否启用音频转录，默认 true', en: 'Enable audio transcription, default true' },
  'tools.media.audio.maxBytes': { zh: '最大音频大小（字节），默认 20971520 (20MB)', en: 'Max audio size (bytes), default 20971520 (20MB)' },
  'tools.media.video': { zh: '视频处理配置', en: 'Video processing configuration' },
  'tools.media.video.enabled': { zh: '是否启用视频处理，默认 true', en: 'Enable video processing, default true' },
  'tools.media.video.maxBytes': { zh: '最大视频大小（字节），默认 52428800 (50MB)', en: 'Max video size (bytes), default 52428800 (50MB)' },
  'tools.agentToAgent': { zh: '智能体间通信设置', en: 'Inter-agent communication settings' },
  'tools.agentToAgent.enabled': { zh: '是否启用智能体间通信，默认 false', en: 'Enable inter-agent communication, default false' },
  'tools.agentToAgent.allow': { zh: '允许通信的目标智能体列表', en: 'Allowed target agents for communication' },
  'tools.sessions': { zh: '工具会话配置', en: 'Tool session configuration' },
  'tools.sessions.visibility': { zh: '会话可见性范围', en: 'Session visibility scope' },
  'tools.subagents': { zh: '子智能体配置', en: 'Sub-agent configuration' },
  'tools.subagents.model': { zh: '子智能体默认使用的模型', en: 'Default model for sub-agents' },
  'tools.subagents.maxConcurrent': { zh: '最大并发子智能体数，默认 1', en: 'Max concurrent sub-agents, default 1' },
  'tools.subagents.archiveAfterMinutes': { zh: '子智能体归档超时（分钟），默认 60', en: 'Sub-agent archive timeout (minutes), default 60' },
  'tools.sandbox': { zh: '工具沙箱设置', en: 'Tool sandbox settings' },

  // ── Skills ─────────────────────────────────────────────
  'skills.allowBundled': { zh: '允许的内置技能白名单列表', en: 'Allowed built-in skill allowlist' },
  'skills.load': { zh: '技能加载配置', en: 'Skill loading configuration' },
  'skills.load.extraDirs': { zh: '额外技能目录路径列表', en: 'Extra skill directory paths' },
  'skills.install': { zh: '技能安装配置', en: 'Skill installation configuration' },
  'skills.install.preferBrew': { zh: '是否优先使用 Homebrew 安装，默认 true', en: 'Prefer Homebrew for installation, default true' },
  'skills.install.nodeManager': { zh: 'Node.js 包管理器：npm/pnpm/yarn', en: 'Node.js package manager: npm/pnpm/yarn' },
  'skills.entries': { zh: '各技能的专属配置', en: 'Per-skill specific configuration' },

  // ── Plugins ────────────────────────────────────────────
  'plugins.enabled': { zh: '是否启用插件系统，默认 true', en: 'Enable plugin system, default true' },
  'plugins.allow': { zh: '插件白名单列表', en: 'Plugin allowlist' },
  'plugins.deny': { zh: '插件黑名单列表', en: 'Plugin denylist' },
  'plugins.load': { zh: '插件加载配置', en: 'Plugin loading configuration' },
  'plugins.load.paths': { zh: '额外插件搜索路径', en: 'Extra plugin search paths' },
  'plugins.entries': { zh: '各插件的专属配置', en: 'Per-plugin specific configuration' },

  // ── Browser ────────────────────────────────────────────
  'browser.enabled': { zh: '是否启用浏览器自动化工具', en: 'Enable browser automation tools' },
  'browser.evaluateEnabled': { zh: '是否允许 act:evaluate（页面内 JS 执行），默认 true', en: 'Allow act:evaluate (in-page JS execution), default true' },
  'browser.defaultProfile': { zh: '默认浏览器配置文件，如 chrome', en: 'Default browser profile, e.g. chrome' },
  'browser.profiles': { zh: '浏览器配置文件列表（CDP 端口和远程连接）', en: 'Browser profiles (CDP ports and remote connections)' },
  'browser.color': { zh: '浏览器 UI 强调色，默认 #FF4500', en: 'Browser UI accent color, default #FF4500' },
  'browser.headless': { zh: '是否以无头模式运行浏览器', en: 'Run browser in headless mode' },
  'browser.noSandbox': { zh: '禁用 Chromium 沙箱（容器环境可能需要）', en: 'Disable Chromium sandbox (may be needed in containers)' },
  'browser.executablePath': { zh: '浏览器可执行文件路径（自动检测时为空）', en: 'Browser executable path (empty for auto-detection)' },
  'browser.attachOnly': { zh: '仅附加模式，不启动新浏览器实例', en: 'Attach-only mode, don\'t launch new browser instances' },

  // ── Talk ───────────────────────────────────────────────
  'talk.voiceId': { zh: 'ElevenLabs 语音 ID', en: 'ElevenLabs voice ID' },
  'talk.voiceAliases': { zh: '语音别名映射表', en: 'Voice alias mapping' },
  'talk.modelId': { zh: 'ElevenLabs 模型 ID，默认 eleven_v3', en: 'ElevenLabs model ID, default eleven_v3' },
  'talk.outputFormat': { zh: '音频输出格式，默认 mp3_44100_128', en: 'Audio output format, default mp3_44100_128' },
  'talk.apiKey': { zh: 'ElevenLabs API 密钥', en: 'ElevenLabs API key' },
  'talk.interruptOnSpeech': { zh: '用户说话时是否中断当前输出，默认 true', en: 'Interrupt current output when user speaks, default true' },

  // ── Channels ───────────────────────────────────────────
  'enabled': { zh: '是否启用此通道', en: 'Enable this channel' },
  'botToken': { zh: 'Bot 令牌，建议使用环境变量 ${BOT_TOKEN}', en: 'Bot token, recommend using env var ${BOT_TOKEN}' },
  'token': { zh: '认证令牌', en: 'Authentication token' },
  'dmPolicy': { zh: '私信策略，控制谁可以向 Bot 发送直接消息', en: 'DM policy — controls who can send direct messages to the bot' },
  'groupPolicy': { zh: '群组消息策略，控制 Bot 是否响应群聊消息', en: 'Group policy — controls whether the bot responds to group messages' },
  'allowFrom': { zh: '允许发送消息的用户/来源列表', en: 'Allowed users/sources for sending messages' },
  'groupAllowFrom': { zh: '允许触发的群组/服务器 ID 列表', en: 'Allowed group/server IDs for triggering' },
  'groups': { zh: '群组配置，控制群聊中的 Bot 行为', en: 'Group settings — control bot behavior in group chats' },
  'guilds': { zh: 'Discord 服务器配置列表', en: 'Discord server configuration list' },
  'streamMode': { zh: '流式输出模式，实时显示生成过程', en: 'Streaming output mode — show generation process in real time' },
  'replyToMode': { zh: '消息回复引用模式', en: 'Message reply-quote mode' },
  'chunkMode': { zh: '长消息拆分策略', en: 'Long message splitting strategy' },
  'textChunkLimit': { zh: '每条消息最大字符数', en: 'Max characters per message' },
  'mediaMaxMb': { zh: '最大媒体文件大小（MB）', en: 'Max media file size (MB)' },
  'reactionNotifications': { zh: '表情反应通知设置', en: 'Reaction notification settings' },
  'chatmode': { zh: '聊天触发模式（Mattermost）', en: 'Chat trigger mode (Mattermost)' },
  'breakPreference': { zh: '文本块断开偏好', en: 'Text block break preference' },
  'historyScope': { zh: '历史记录范围', en: 'History scope' },
  'historyLimit': { zh: '历史消息保留数量', en: 'Number of history messages to retain' },
  'draftChunk': { zh: '草稿分块配置', en: 'Draft chunk configuration' },
  'sendReadReceipts': { zh: '是否发送已读回执', en: 'Whether to send read receipts' },

  // ── Hooks ──────────────────────────────────────────────
  'hooks.enabled': { zh: '启用 Webhook 接收服务', en: 'Enable webhook receiver service' },
  'hooks.token': { zh: 'Webhook 认证令牌（必需）', en: 'Webhook authentication token (required)' },
  'hooks.path': { zh: 'Webhook 接收路径，默认 /hooks', en: 'Webhook receiver path, default /hooks' },
  'hooks.maxBodyBytes': { zh: '最大请求体大小（字节），默认 262144 (256KB)', en: 'Max request body size (bytes), default 262144 (256KB)' },
  'hooks.defaultSessionKey': { zh: '默认会话键，默认 hook:ingress', en: 'Default session key, default hook:ingress' },
  'hooks.allowRequestSessionKey': { zh: '是否允许请求中指定会话键，默认 false', en: 'Allow specifying session key in requests, default false' },
  'hooks.allowedSessionKeyPrefixes': { zh: '允许的会话键前缀列表', en: 'Allowed session key prefix list' },
  'hooks.allowedAgentIds': { zh: '允许的智能体 ID 列表', en: 'Allowed agent IDs' },
  'hooks.presets': { zh: 'Webhook 预设模板列表，如 gmail', en: 'Webhook preset templates, e.g. gmail' },
  'hooks.transformsDir': { zh: '变换脚本目录，默认 ~/.openclaw/hooks/transforms', en: 'Transform scripts directory, default ~/.openclaw/hooks/transforms' },
  'hooks.mappings': { zh: '事件路由映射规则列表', en: 'Event routing mapping rules' },
  'hooks.gmail': { zh: 'Gmail Pub/Sub 邮件集成配置', en: 'Gmail Pub/Sub email integration configuration' },

  // ── Cron ───────────────────────────────────────────────
  'cron.enabled': { zh: '启用定时任务调度器', en: 'Enable cron job scheduler' },
  'cron.jobs': { zh: '定时任务列表', en: 'Cron job list' },
  'cron.maxConcurrentRuns': { zh: '最大并发执行数，默认 2', en: 'Max concurrent runs, default 2' },
  'cron.sessionRetention': { zh: '任务会话保留时间，如 24h', en: 'Job session retention time, e.g. 24h' },

  // ── Commands ────────────────────────────────────────────
  'commands.native': { zh: '原生命令支持（平台级 /commands）', en: 'Native command support (platform-level /commands)' },
  'commands.text': { zh: '是否解析 /commands 文本命令，默认 true', en: 'Parse /commands text commands, default true' },
  'commands.bash': { zh: '是否允许 ! (bash) Shell 命令执行，默认 false', en: 'Allow ! (bash) shell command execution, default false' },
  'commands.bashForegroundMs': { zh: 'Bash 前台执行超时（毫秒），默认 2000', en: 'Bash foreground execution timeout (ms), default 2000' },
  'commands.config': { zh: '是否允许 /config 配置编辑命令，默认 false', en: 'Allow /config config editing command, default false' },
  'commands.debug': { zh: '是否启用 /debug 调试命令，默认 false', en: 'Enable /debug debugging command, default false' },
  'commands.restart': { zh: '是否允许 /restart 重启命令，默认 false', en: 'Allow /restart restart command, default false' },
  'commands.allowFrom': { zh: '按渠道设定命令使用白名单', en: 'Command usage allowlist by channel' },
  'commands.useAccessGroups': { zh: '是否使用访问组权限控制，默认 true', en: 'Use access group permission control, default true' },

  // ── Bindings ───────────────────────────────────────────
  'bindings': { zh: '消息路由规则列表，按渠道和条件分配智能体', en: 'Message routing rules — assign agents by channel and conditions' },

  // ── Auth ───────────────────────────────────────────────
  'auth.profiles': { zh: 'API 密钥和 OAuth 认证配置文件', en: 'API key and OAuth authentication profiles' },
  'auth.order': { zh: '按提供商设定配置文件的使用优先级', en: 'Set profile usage priority by provider' },

  // ── Env ────────────────────────────────────────────────
  'env.vars': { zh: '环境变量键值对，可在配置中用 ${VAR_NAME} 引用', en: 'Environment variable key-value pairs, use ${VAR_NAME} in config' },
  'env.shellEnv': { zh: 'Shell 环境加载配置', en: 'Shell environment loading configuration' },
  'env.shellEnv.enabled': { zh: '是否从 shell 环境加载变量，默认 true', en: 'Load variables from shell environment, default true' },
  'env.shellEnv.timeoutMs': { zh: 'shell 环境加载超时（毫秒），默认 15000', en: 'Shell environment loading timeout (ms), default 15000' },

  // ── Logging ─────────────────────────────────────────────
  'logging.level': { zh: '日志级别，默认 info', en: 'Log level, default info' },
  'logging.file': { zh: '日志文件输出路径', en: 'Log file output path' },
  'logging.consoleLevel': { zh: '控制台日志级别，默认 info', en: 'Console log level, default info' },
  'logging.consoleStyle': { zh: '控制台日志输出样式', en: 'Console log output style' },
  'logging.redactSensitive': { zh: '是否对敏感信息进行脱敏处理', en: 'Whether to redact sensitive information' },
  'logging.redactPatterns': { zh: '自定义脱敏正则表达式列表', en: 'Custom redaction regex pattern list' },

  // ── UI ──────────────────────────────────────────────────
  'ui.seamColor': { zh: '主题强调色，默认 #FF4500', en: 'Theme accent color, default #FF4500' },
  'ui.assistant': { zh: '助手显示设置', en: 'Assistant display settings' },
  'ui.assistant.name': { zh: '助手显示名称，默认 OpenClaw', en: 'Assistant display name, default OpenClaw' },
  'ui.assistant.avatar': { zh: '助手头像（文字/表情/URL），默认 CB', en: 'Assistant avatar (text/emoji/URL), default CB' },

  // ── Discovery ───────────────────────────────────────────
  'discovery.mdns': { zh: 'mDNS 服务发现设置', en: 'mDNS service discovery settings' },
  'discovery.mdns.mode': { zh: '服务发现广播级别', en: 'Service discovery broadcast level' },
  'discovery.wideArea': { zh: '广域 DNS-SD 发现配置', en: 'Wide-area DNS-SD discovery configuration' },
  'discovery.wideArea.enabled': { zh: '是否启用广域 DNS-SD 发现', en: 'Enable wide-area DNS-SD discovery' },

  // ── Web ──────────────────────────────────────────────────
  'web.enabled': { zh: '是否启用内置 Web 聊天渠道，默认 true', en: 'Enable built-in web chat channel, default true' },
  'web.heartbeatSeconds': { zh: '心跳间隔（秒），默认 60', en: 'Heartbeat interval (seconds), default 60' },
  'web.reconnect': { zh: 'Web 渠道重连配置', en: 'Web channel reconnection configuration' },
  'web.reconnect.initialMs': { zh: '初始重连延迟（毫秒），默认 2000', en: 'Initial reconnection delay (ms), default 2000' },
  'web.reconnect.maxMs': { zh: '最大重连延迟（毫秒），默认 120000', en: 'Max reconnection delay (ms), default 120000' },
  'web.reconnect.factor': { zh: '指数退避因子，默认 1.4', en: 'Exponential backoff factor, default 1.4' },
  'web.reconnect.jitter': { zh: '重连抖动因子，默认 0.2', en: 'Reconnection jitter factor, default 0.2' },
  'web.reconnect.maxAttempts': { zh: '最大重连次数，0=无限，默认 0', en: 'Max reconnection attempts, 0=unlimited, default 0' },

  // ── Canvas Host ─────────────────────────────────────────
  'canvasHost.root': { zh: 'Canvas 根目录，默认 ~/.openclaw/workspace/canvas', en: 'Canvas root directory, default ~/.openclaw/workspace/canvas' },
  'canvasHost.liveReload': { zh: '是否启用实时重载，默认 true', en: 'Enable live reload, default true' },
  'canvasHost.enabled': { zh: '是否启用 Canvas 服务', en: 'Enable Canvas service' },
}

// ─── Helper Functions ────────────────────────────────────────────────

/** FieldGroup with resolved (locale-specific) string labels */
export type ResolvedFieldGroup = Omit<FieldGroup, 'label' | 'description'> & { label: string; description?: string }

/** Get resolved category label for a locale */
export function getCategoryLabel(category: ModuleCategory, locale: Language): string {
  return t(category.label, locale)
}

/** Get knowledge entry for a module, resolved to the given locale */
export function getModuleKnowledge(
  moduleKey: string,
  locale: Language,
): { description: string; requiresRestart?: boolean } | undefined {
  const entry = MODULE_KNOWLEDGE[moduleKey]
  if (!entry) return undefined
  return { description: t(entry.description, locale), requiresRestart: entry.requiresRestart }
}

/** Get field groups for a module, resolved to the given locale */
export function getFieldGroups(
  moduleKey: string,
  locale: Language,
): ResolvedFieldGroup[] {
  const groups = MODULE_FIELD_GROUPS[moduleKey]
  if (!groups) return []
  return groups.map((g) => ({
    ...g,
    label: t(g.label, locale),
    description: g.description ? t(g.description, locale) : undefined,
  }))
}

/** Get the icon for a module */
export function getModuleIcon(moduleKey: string): string {
  return MODULE_ICONS[moduleKey] ?? '📦'
}

/**
 * Get enum option descriptions for a field path, resolved to the given locale.
 * Tries exact path first, then falls back to the last segment
 * (e.g., "channels.telegram.dmPolicy" → "dmPolicy").
 */
export function getEnumDescriptions(
  path: string,
  locale: Language,
): Record<string, string> | undefined {
  const biTextMap = ENUM_DESCRIPTIONS[path]
    ?? (() => {
      const lastKey = path.split('.').pop()
      return lastKey ? ENUM_DESCRIPTIONS[lastKey] : undefined
    })()
  if (!biTextMap) return undefined

  const result: Record<string, string> = {}
  for (const [key, val] of Object.entries(biTextMap)) {
    result[key] = t(val, locale)
  }
  return result
}

/**
 * Get supplementary field description, resolved to the given locale.
 * Tries exact path first, then falls back to the last segment.
 */
export function getFieldDescription(
  path: string,
  locale: Language,
): string | undefined {
  const entry = FIELD_KNOWLEDGE[path]
    ?? (() => {
      const lastKey = path.split('.').pop()
      return lastKey ? FIELD_KNOWLEDGE[lastKey] : undefined
    })()
  if (!entry) return undefined
  return t(entry, locale)
}
