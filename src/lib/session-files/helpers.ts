export type SessionFileZone = 'input' | 'output'

export function buildSessionBasePath(agentId: string, chatSessionId: string): string {
  return `/workspace/${agentId}/sessions/${chatSessionId}/`
}

export function buildSessionInputPath(agentId: string, chatSessionId: string): string {
  return `${buildSessionBasePath(agentId, chatSessionId)}input/`
}

export function buildSessionOutputPath(agentId: string, chatSessionId: string): string {
  return `${buildSessionBasePath(agentId, chatSessionId)}output/`
}

export function resolveSessionFilePath(
  agentId: string,
  chatSessionId: string,
  zone: SessionFileZone,
  relativePath?: string,
): string {
  const base = zone === 'input'
    ? buildSessionInputPath(agentId, chatSessionId)
    : buildSessionOutputPath(agentId, chatSessionId)
  if (!relativePath) return base
  return `${base}${relativePath}`
}

/**
 * Build the path for the `current-session` symlink in the agent workspace.
 * This symlink points to the active session directory so the agent can
 * discover files via `current-session/input/` without knowing the full path.
 */
export function buildCurrentSessionLinkPath(agentId: string): string {
  return `/workspace/${agentId}/current-session`
}

/**
 * Build the relative target for the `current-session` symlink.
 * Relative to the agent workspace so it works inside the container.
 */
export function buildCurrentSessionTarget(chatSessionId: string): string {
  return `sessions/${chatSessionId}`
}

// --- External instance paths (host filesystem) ---

export function buildExternalSessionBasePath(
  workspacePath: string, agentId: string, chatSessionId: string,
): string {
  return `${workspacePath}/agents/${agentId}/sessions/${chatSessionId}/`
}

export function resolveExternalSessionFilePath(
  workspacePath: string, agentId: string, chatSessionId: string,
  zone: SessionFileZone, relativePath?: string,
): string {
  const base = `${buildExternalSessionBasePath(workspacePath, agentId, chatSessionId)}${zone}/`
  return relativePath ? `${base}${relativePath}` : base
}

export function buildExternalCurrentSessionLinkPath(
  workspacePath: string, agentId: string,
): string {
  return `${workspacePath}/agents/${agentId}/current-session`
}

/**
 * Build the path for the `current-session` symlink in the agent's **workspace** directory.
 * The workspace is the agent's CWD — this is where the agent actually looks for
 * `current-session/input/`.
 *
 * Convention: main/default agent → `{wp}/workspace/`, others → `{wp}/workspace-{agentId}/`.
 */
export function buildExternalWorkspaceSessionLinkPath(
  workspacePath: string, agentId: string,
): string {
  const wsDir = (agentId === 'main' || agentId === 'default')
    ? `${workspacePath}/workspace`
    : `${workspacePath}/workspace-${agentId}`
  return `${wsDir}/current-session`
}

/**
 * Build the relative symlink target from the workspace directory to the session folder
 * in the agents directory.
 *
 * e.g. from `workspace-internet/current-session` → `../agents/internet/sessions/{cuid}`
 */
export function buildExternalWorkspaceSessionTarget(
  agentId: string, chatSessionId: string,
): string {
  return `../agents/${agentId}/sessions/${chatSessionId}`
}

export function isSessionPathSafe(relativePath: string): boolean {
  if (!relativePath) return false
  if (relativePath.includes('..')) return false
  if (relativePath.includes('\0')) return false
  if (relativePath.startsWith('/')) return false
  return true
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}
