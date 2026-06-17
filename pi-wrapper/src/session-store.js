export class SessionStore {
  constructor({ runtime, ttlMs = 60 * 60 * 1000, now = () => Date.now() }) {
    this.runtime = runtime
    this.ttlMs = ttlMs
    this.now = now
    this.sessions = new Map()
  }

  async getOrCreate(sessionKey, options = {}) {
    const existing = this.sessions.get(sessionKey)
    if (existing) {
      existing.lastActiveAt = this.now()
      return existing.session
    }

    const session = await this.runtime.createSession({
      sessionKey,
      cwd: options.cwd,
      agentId: options.agentId,
      userId: options.userId,
    })
    this.sessions.set(sessionKey, {
      session,
      lastActiveAt: this.now(),
    })
    return session
  }

  get(sessionKey) {
    const entry = this.sessions.get(sessionKey)
    if (!entry) return undefined
    entry.lastActiveAt = this.now()
    return entry.session
  }

  async abort(sessionKey) {
    const session = this.get(sessionKey)
    if (!session) return false
    await session.abort?.()
    return true
  }

  async delete(sessionKey, options = {}) {
    const entry = this.sessions.get(sessionKey)
    if (!entry) return false
    this.sessions.delete(sessionKey)
    if (options.destroy) {
      await (entry.session.destroy?.() ?? entry.session.dispose?.())
    } else {
      await entry.session.dispose?.()
    }
    return true
  }

  async sweep() {
    const cutoff = this.now() - this.ttlMs
    const expired = []
    for (const [sessionKey, entry] of this.sessions.entries()) {
      if (entry.lastActiveAt < cutoff) {
        expired.push(sessionKey)
      }
    }
    await Promise.all(expired.map((sessionKey) => this.delete(sessionKey)))
    return expired
  }

  async dispose() {
    const keys = [...this.sessions.keys()]
    await Promise.all(keys.map((sessionKey) => this.delete(sessionKey)))
  }
}
