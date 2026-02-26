import { randomBytes } from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'

// ─── Types ──────────────────────────────────────────────────────────

export interface ModelProviderConfig {
  name: string
  apiKey: string
  api?: string        // e.g., "anthropic-messages"
  baseUrl?: string
}

export interface InstanceConfig {
  instanceName: string
  gatewayToken?: string           // auto-generated if not provided
  gatewayPort?: number            // default 18789
  modelProvider?: ModelProviderConfig
  defaultAgentId?: string         // default "main"
  env?: Record<string, string>    // extra env vars for openclaw.json env block
  hostDataDir?: string            // host path to instance data dir (for sandbox workspace mapping)
}

// ─── Config Generation ──────────────────────────────────────────────

/**
 * Generate a secure random gateway token.
 */
export function generateGatewayToken(): string {
  return `tc-${randomBytes(24).toString('hex')}`
}

/**
 * Build a minimal but complete openclaw.json for a new instance.
 *
 * Structure mirrors the real config at ~/.openclaw/openclaw.json but strips
 * non-essential sections (channels, plugins, hooks) that can be configured later.
 */
export function generateOpenClawConfig(config: InstanceConfig): Record<string, unknown> {
  const token = config.gatewayToken || generateGatewayToken()
  const port = config.gatewayPort || 18789
  const agentId = config.defaultAgentId || 'main'

  // When hostDataDir is set, use host-resolvable paths for workspace.
  // This enables OpenClaw sandbox (Docker-in-Docker) to bind-mount the workspace
  // into sandbox containers using paths the host Docker daemon can resolve.
  const wsPrefix = config.hostDataDir
    ? `${config.hostDataDir}/workspace`
    : '/workspace'

  const result: Record<string, unknown> = {
    gateway: {
      port,
      mode: 'local',
      bind: 'lan',        // Must bind to LAN interfaces inside Docker for host access
      auth: {
        mode: 'token',
        token,
      },
      controlUi: {
        allowInsecureAuth: true, // Docker: backend connects without browser origin header
        dangerouslyDisableDeviceAuth: true, // Backend client: no device key-pair, use token auth only
      },
    },
    agents: {
      defaults: {
        workspace: `${wsPrefix}/default`,
        compaction: { mode: 'safeguard' },
        maxConcurrent: 4,
        subagents: { maxConcurrent: 8 },
      },
      list: [
        {
          id: agentId,
          default: true,
          workspace: `${wsPrefix}/${agentId}`,
        },
      ],
    },
    session: {
      dmScope: 'per-account-channel-peer',
    },
    commands: {
      native: 'auto',
      nativeSkills: 'auto',
      ownerDisplay: 'raw', // Deliver user messages without metadata decoration (requires OpenClaw >= 2026.2.21)
    },
  }

  // Add model provider if specified
  if (config.modelProvider) {
    const { name, apiKey, api, baseUrl } = config.modelProvider
    const providerEntry: Record<string, unknown> = { apiKey }
    if (api) providerEntry.api = api
    if (baseUrl) providerEntry.baseUrl = baseUrl

    result.models = {
      mode: 'merge',
      providers: {
        [name]: providerEntry,
      },
    }

    // Set as default model if provider has a standard model pattern
    const agentsBlock = result.agents as Record<string, unknown>
    const defaults = agentsBlock.defaults as Record<string, unknown>
    defaults.model = { primary: `${name}/${name}` }
  }

  // Add extra env vars
  if (config.env && Object.keys(config.env).length > 0) {
    result.env = config.env
  }

  return result
}

// ─── File System Operations ──────────────────────────────────────────

/**
 * Base directory for all TeamClaw-managed instance data on the host.
 */
export function getInstancesBaseDir(): string {
  return process.env.TEAMCLAW_DATA_DIR || path.join(os.homedir(), '.teamclaw', 'instances')
}

/**
 * Full path to a specific instance's data directory.
 */
export function getInstanceDataDir(instanceName: string): string {
  return path.join(getInstancesBaseDir(), instanceName)
}

/**
 * Initialize instance files on the host:
 * 1. Create instance data directory
 * 2. Write openclaw.json
 * 3. Create workspace and agent sub-directories
 *
 * Returns the gateway token used (plaintext).
 */
export async function initializeInstanceFiles(config: InstanceConfig): Promise<{
  dataDir: string
  gatewayToken: string
  configJson: Record<string, unknown>
}> {
  const dataDir = getInstanceDataDir(config.instanceName)
  const agentId = config.defaultAgentId || 'main'
  const gatewayToken = config.gatewayToken || generateGatewayToken()

  // Generate config — resolve 'resolve' hostDataDir to actual dataDir
  const hostDataDir = config.hostDataDir === 'resolve' ? dataDir : config.hostDataDir
  const configJson = generateOpenClawConfig({ ...config, gatewayToken, hostDataDir })

  // Create directory structure
  await fs.mkdir(dataDir, { recursive: true })
  await fs.mkdir(path.join(dataDir, 'workspace', 'default'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'workspace', agentId), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'agents'), { recursive: true })
  await fs.mkdir(path.join(dataDir, 'skills'), { recursive: true })

  // Write openclaw.json
  await fs.writeFile(
    path.join(dataDir, 'openclaw.json'),
    JSON.stringify(configJson, null, 2),
    'utf-8',
  )

  return { dataDir, gatewayToken, configJson }
}

/**
 * Remove all instance files from the host.
 * Validates the instance name to prevent path traversal.
 */
export async function cleanupInstanceFiles(instanceName: string): Promise<void> {
  // Safety: ensure name contains only safe characters
  if (!/^[a-zA-Z0-9_-]+$/.test(instanceName)) {
    throw new Error(`Invalid instance name for cleanup: ${instanceName}`)
  }

  const dataDir = getInstanceDataDir(instanceName)

  try {
    await fs.rm(dataDir, { recursive: true, force: true })
  } catch (err) {
    // Ignore if directory doesn't exist
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
}
