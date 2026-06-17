const SESSION_KEY_PATTERN = /^agent:pi:([^:]+):tc:([^:]+)$/

export function parsePiSessionKey(sessionKey) {
  if (typeof sessionKey !== 'string') {
    throw new Error('sessionKey is required')
  }
  const match = SESSION_KEY_PATTERN.exec(sessionKey)
  if (!match) {
    throw new Error('sessionKey must match agent:pi:<agentId>:tc:<userId>')
  }
  return {
    agentId: match[1],
    userId: match[2],
  }
}
