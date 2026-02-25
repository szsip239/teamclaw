export type SessionFileZone = 'input' | 'output'

export function buildSessionBasePath(agentId: string, userId: string, chatSessionId: string): string {
  return `/workspace/${agentId}/users/${userId}/sessions/${chatSessionId}/`
}

export function buildSessionInputPath(agentId: string, userId: string, chatSessionId: string): string {
  return `${buildSessionBasePath(agentId, userId, chatSessionId)}input/`
}

export function buildSessionOutputPath(agentId: string, userId: string, chatSessionId: string): string {
  return `${buildSessionBasePath(agentId, userId, chatSessionId)}output/`
}

export function resolveSessionFilePath(
  agentId: string,
  userId: string,
  chatSessionId: string,
  zone: SessionFileZone,
  relativePath?: string,
): string {
  const base = zone === 'input'
    ? buildSessionInputPath(agentId, userId, chatSessionId)
    : buildSessionOutputPath(agentId, userId, chatSessionId)
  if (!relativePath) return base
  return `${base}${relativePath}`
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
