import { createHash } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { readModelsConfig, patchModelsConfig } from './config-store.js'
import { gatewayMessagesFromSessionEntries, toGatewayHistoryMessage } from './message-utils.js'

export function getDefaultAgentDir(home = process.env.HOME) {
  return process.env.PI_AGENT_DIR ?? join(home ?? '/home/node', '.openclaw')
}

export class PiRuntime {
  constructor({ agentDir = getDefaultAgentDir(), createSession } = {}) {
    this.agentDir = agentDir
    this.createSessionImpl = createSession
    this.modelRegistry = undefined
  }

  async listAgents() {
    return {
      agents: [
        {
          id: 'pi',
          name: 'pi',
          status: 'active',
          runtime: 'pi',
        },
      ],
      defaultId: 'pi',
    }
  }

  async createSession(options) {
    if (this.createSessionImpl) return this.createSessionImpl(options)
    return createRealPiSession({ ...options, agentDir: this.agentDir, runtime: this })
  }

  async getConfig() {
    const { path, raw, config } = await readModelsConfig(this.agentDir)
    return { path, raw, hash: hashRawConfig(raw), config }
  }

  async patchConfig(patch) {
    const result = await patchModelsConfig(this.agentDir, patch)
    applyRuntimeApiKeys(this.authStorage, result.config)
    this.modelRegistry?.refresh?.()
    return { ok: true, path: result.path, raw: result.raw, hash: hashRawConfig(result.raw), config: result.config }
  }
}

async function createRealPiSession({ sessionKey, cwd, agentDir, runtime }) {
  const {
    AuthStorage,
    createAgentSession,
    ModelRegistry,
    SessionManager,
  } = await import('@mariozechner/pi-coding-agent')

  const effectiveCwd = cwd || process.cwd()
  const sessionDir = join(agentDir, 'teamclaw-sessions', encodeSessionKey(sessionKey))
  const authStorage = AuthStorage.create(join(agentDir, 'auth.json'))
  const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, 'models.json'))
  const { config } = await readModelsConfig(agentDir)
  applyRuntimeApiKeys(authStorage, config)
  modelRegistry.refresh()
  runtime.authStorage = authStorage
  runtime.modelRegistry = modelRegistry

  const { session } = await createAgentSession({
    cwd: effectiveCwd,
    agentDir,
    authStorage,
    modelRegistry,
    sessionManager: SessionManager.continueRecent(effectiveCwd, sessionDir),
  })

  return new RealPiSession(session)
}

class RealPiSession {
  constructor(session) {
    this.session = session
  }

  async prompt({ message, emit }) {
    const unsubscribe = this.session.subscribe((event) => emit(event))
    try {
      await this.session.prompt(message, { source: 'rpc' })
      const last = this.session.getLastAssistantText?.()
      if (last) {
        emit({
          type: 'message_end',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: last }],
            stopReason: 'stop',
            timestamp: Date.now(),
          },
        })
      }
    } finally {
      unsubscribe()
    }
  }

  async abort() {
    await this.session.abort()
  }

  async getHistory() {
    const entries = this.session.sessionManager?.getEntries?.()
    if (entries) return gatewayMessagesFromSessionEntries(entries)
    return (this.session.messages ?? []).map(toGatewayHistoryMessage).filter(Boolean)
  }

  async dispose() {
    this.session.dispose()
  }

  async destroy() {
    const sessionFile = this.session.sessionFile
    this.session.dispose()
    if (sessionFile) {
      await rm(sessionFile, { force: true })
    }
  }
}

function encodeSessionKey(sessionKey = 'default') {
  return Buffer.from(sessionKey).toString('base64url')
}

function applyRuntimeApiKeys(authStorage, config) {
  if (!authStorage || !config?.providers || typeof config.providers !== 'object') return
  for (const [provider, providerConfig] of Object.entries(config.providers)) {
    if (!providerConfig || typeof providerConfig !== 'object') continue
    if (typeof providerConfig.apiKey === 'string' && providerConfig.apiKey) {
      authStorage.setRuntimeApiKey(provider, providerConfig.apiKey)
    }
  }
}

function hashRawConfig(raw) {
  return createHash('sha256').update(raw || '{}').digest('hex')
}
