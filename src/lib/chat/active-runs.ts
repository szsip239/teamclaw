/**
 * Track which chat sessions currently have an active run (agent is generating).
 * Used by the history API to return `isRunning` so the UI can show a loading indicator
 * even when the user wasn't the one who initiated the streaming (e.g. switched back).
 *
 * Uses a Map<sessionId, startTimestamp> instead of a Set so that stale entries
 * (e.g. from a gateway disconnect where cleanup() never ran) auto-expire.
 */
const MAX_RUN_MS = 10 * 60 * 1000 // 10 minutes — no single run should last longer

const g = globalThis as unknown as { __activeRuns?: Map<string, number> }
if (!g.__activeRuns) g.__activeRuns = new Map<string, number>()

const runs = g.__activeRuns

export const activeRuns = {
  add(sessionId: string) {
    runs.set(sessionId, Date.now())
  },
  delete(sessionId: string) {
    runs.delete(sessionId)
  },
  has(sessionId: string): boolean {
    const started = runs.get(sessionId)
    if (!started) return false
    if (Date.now() - started > MAX_RUN_MS) {
      runs.delete(sessionId) // auto-cleanup stale entry
      return false
    }
    return true
  },
}
