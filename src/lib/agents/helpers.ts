import { prisma } from '@/lib/db'
import { registry } from '@/lib/gateway/registry'
import { dockerManager } from '@/lib/docker'
import type { AgentConfigEntry, AgentDefaults, WorkspaceFileEntry } from '@/types/gateway'
import type { AgentCategory } from '@/types/agent'
import type { AgentMeta } from '@/generated/prisma'
import type { AuthUser } from '@/types/auth'

/**
 * Parse a composite agent ID into instanceId + agentId.
 * Format: "{instanceId}:{agentId}"
 */
export function parseAgentId(compositeId: string): { instanceId: string; agentId: string } | null {
  const colonIdx = compositeId.indexOf(':')
  if (colonIdx === -1) return null
  const instanceId = compositeId.slice(0, colonIdx)
  const agentId = compositeId.slice(colonIdx + 1)
  if (!instanceId || !agentId) return null
  return { instanceId, agentId }
}

/** Build a composite agent ID */
export function buildAgentId(instanceId: string, agentId: string): string {
  return `${instanceId}:${agentId}`
}

/** Extract agents config from a parsed openclaw.json */
export function extractAgentsConfig(config: Record<string, unknown>): {
  defaults: AgentDefaults
  list: AgentConfigEntry[]
} {
  const agents = (config.agents ?? {}) as Record<string, unknown>
  const defaults = (agents.defaults ?? {}) as AgentDefaults
  const list = (agents.list ?? []) as AgentConfigEntry[]
  return { defaults, list }
}

/** Get workspace path for an agent, resolving defaults */
export function resolveWorkspacePath(
  agent: AgentConfigEntry,
  defaults: AgentDefaults,
): string {
  return agent.workspace || (defaults as Record<string, unknown>).workspace as string || '~/.openclaw/workspace'
}

/** Resolve workspace path for container (expand ~ to /root) */
export function containerWorkspacePath(workspacePath: string): string {
  return workspacePath.replace(/^~/, '/root')
}

/** List workspace files for an agent via Docker exec */
export async function listAgentWorkspaceFiles(
  containerId: string,
  workspacePath: string,
): Promise<WorkspaceFileEntry[]> {
  const containerPath = containerWorkspacePath(workspacePath)
  try {
    return await dockerManager.listContainerDir(containerId, containerPath)
  } catch {
    return [] // Workspace may not exist yet
  }
}

/** Get instance with containerId validation */
export async function getInstanceWithContainer(instanceId: string) {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: { id: true, name: true, containerId: true, status: true },
  })
  return instance
}

/** Known agent config fields accepted by OpenClaw's config.patch */
const KNOWN_AGENT_FIELDS = new Set([
  'id', 'workspace', 'agentDir', 'profile', 'default',
  'models', 'sandbox', 'tools', 'subagents', 'session', 'bindings',
])

const REDACTED_VALUE = '__OPENCLAW_REDACTED__'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * Recursively strip `__OPENCLAW_REDACTED__` values from an object.
 * Sending redacted values back to OpenClaw via config.patch causes it to
 * detect "truncated" redacted arrays and trigger a SIGUSR1 restart.
 */
export function stripRedactedValues(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value === REDACTED_VALUE) continue
    if (Array.isArray(value)) {
      result[key] = value
        .filter(v => v !== REDACTED_VALUE)
        .map(v => (isPlainObject(v) ? stripRedactedValues(v as Record<string, unknown>) : v))
    } else if (isPlainObject(value)) {
      result[key] = stripRedactedValues(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

/** Strip unknown fields and redacted values from agent entries before sending to config.patch */
export function sanitizeAgentEntry(
  entry: AgentConfigEntry | Record<string, unknown>,
): Record<string, unknown> {
  const clean: Record<string, unknown> = {}
  for (const key of Object.keys(entry)) {
    if (KNOWN_AGENT_FIELDS.has(key)) {
      clean[key] = entry[key as keyof typeof entry]
    }
  }
  return stripRedactedValues(clean)
}

/** Validate path safety (no traversal) */
export function isPathSafe(filePath: string): boolean {
  return !filePath.includes('..') && !filePath.startsWith('/')
}

// ─── Agent Classification Helpers ───────────────────────────────────

/** Check if an agent is visible to a user based on its AgentMeta category */
export function isAgentVisible(
  meta: AgentMeta,
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (meta.category === 'DEFAULT') return true
  if (meta.category === 'DEPARTMENT') {
    return !!user.departmentId && meta.departmentId === user.departmentId
  }
  if (meta.category === 'PERSONAL') {
    return meta.ownerId === user.id
  }
  return false
}

/** Determine what category a user can create agents with */
export function getDefaultCategory(role: string): AgentCategory {
  if (role === 'SYSTEM_ADMIN') return 'DEFAULT'
  if (role === 'DEPT_ADMIN') return 'DEPARTMENT'
  return 'PERSONAL'
}

/** Check if user can create an agent with the given category */
export function canCreateWithCategory(
  role: string,
  category: AgentCategory,
  departmentId: string | null,
  targetDepartmentId?: string,
): boolean {
  if (role === 'SYSTEM_ADMIN') return true
  if (category === 'DEFAULT') return false // Only SYSTEM_ADMIN
  if (category === 'DEPARTMENT') {
    if (role !== 'DEPT_ADMIN') return false
    // DEPT_ADMIN can only create for their own department
    return !targetDepartmentId || targetDepartmentId === departmentId
  }
  // PERSONAL: all roles can create
  return true
}

/** Check if user can manage (edit config of) a specific agent */
export function canManageAgent(
  meta: AgentMeta,
  user: AuthUser,
): boolean {
  if (user.role === 'SYSTEM_ADMIN') return true
  if (meta.category === 'PERSONAL' && meta.ownerId === user.id) return true
  if (meta.category === 'DEPARTMENT' && user.role === 'DEPT_ADMIN') {
    return !!user.departmentId && meta.departmentId === user.departmentId
  }
  return false
}

/**
 * Auto-register gateway agents that have no AgentMeta record.
 * Creates DEFAULT entries for any unknown agents.
 * Uses a system admin user ID as the creator.
 */
export async function autoRegisterAgents(
  instanceId: string,
  gatewayAgentIds: string[],
  fallbackCreatorId?: string,
): Promise<AgentMeta[]> {
  if (gatewayAgentIds.length === 0) return []

  // Find existing metas for this instance
  const existing = await prisma.agentMeta.findMany({
    where: { instanceId },
    select: { agentId: true },
  })
  const existingIds = new Set(existing.map((m) => m.agentId))

  // Filter to only new agents
  const newIds = gatewayAgentIds.filter((id) => !existingIds.has(id))
  if (newIds.length === 0) return []

  // Find a system admin to use as creator, fall back to current user
  const admin = await prisma.user.findFirst({
    where: { role: 'SYSTEM_ADMIN', status: 'ACTIVE' },
    select: { id: true },
  })
  const creatorId = admin?.id ?? fallbackCreatorId
  if (!creatorId) return []

  // Batch create
  await prisma.agentMeta.createMany({
    data: newIds.map((agentId) => ({
      instanceId,
      agentId,
      category: 'DEFAULT' as const,
      createdById: creatorId,
    })),
    skipDuplicates: true,
  })

  // Return the newly created metas
  return prisma.agentMeta.findMany({
    where: { instanceId, agentId: { in: newIds } },
    include: {
      department: { select: { name: true } },
      owner: { select: { name: true } },
    },
  })
}
