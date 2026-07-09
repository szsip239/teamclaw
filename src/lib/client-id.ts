export function createClientId(prefix = 'id'): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    try {
      return randomUUID.call(globalThis.crypto)
    } catch {
      // Fall through to the compatibility path.
    }
  }

  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
