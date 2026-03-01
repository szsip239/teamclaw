import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUserId } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import {
  buildSessionInputPath,
  buildSessionOutputPath,
} from '@/lib/session-files/helpers'

const POLL_INTERVAL_MS = 5_000
const EXEC_TIMEOUT_MS = 8_000
const MAX_LIFETIME_MS = 4 * 60 * 1_000 // 4 minutes — client auto-reconnects

// GET /api/v1/chat/sessions/[id]/files/watch — SSE stream for file changes
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params

  // --- Auth ---
  const userId = await resolveRequestUserId(req)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // --- Validate session ownership ---
  const session = await prisma.chatSession.findUnique({ where: { id } })
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (session.userId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const instance = await prisma.instance.findUnique({
    where: { id: session.instanceId },
  })
  if (!instance?.containerId) {
    return NextResponse.json({ error: 'Instance not ready' }, { status: 400 })
  }

  const containerId = instance.containerId
  const inputDir = buildSessionInputPath(session.agentId, session.id)
  const outputDir = buildSessionOutputPath(session.agentId, session.id)

  // --- SSE stream ---
  const encoder = new TextEncoder()
  let stopped = false
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let lifetimeTimer: ReturnType<typeof setTimeout> | null = null
  let lastMtime = ''

  function cleanup() {
    stopped = true
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null }
    if (lifetimeTimer) { clearTimeout(lifetimeTimer); lifetimeTimer = null }
  }

  // Listen for client disconnect via req.signal (Next.js propagates this)
  req.signal.addEventListener('abort', cleanup, { once: true })

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`),
      )

      // Auto-close after MAX_LIFETIME_MS to prevent indefinite connections.
      // Client-side useFileWatch reconnects automatically with backoff.
      lifetimeTimer = setTimeout(() => {
        cleanup()
        try { controller.close() } catch { /* already closed */ }
      }, MAX_LIFETIME_MS)

      let failCount = 0

      // Sequential poll: wait for previous exec to finish before scheduling next.
      // Prevents docker exec accumulation when container is slow.
      async function poll() {
        if (stopped) return
        try {
          const mtime = await Promise.race([
            dockerManager.execWithOutput(containerId, [
              'sh', '-c',
              'stat -c "%Y" "$1" "$2" 2>/dev/null || true',
              '_', inputDir, outputDir,
            ]),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('exec timeout')), EXEC_TIMEOUT_MS),
            ),
          ])
          failCount = 0
          const trimmed = mtime.trim()
          if (trimmed && trimmed !== lastMtime) {
            lastMtime = trimmed
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'files-changed' })}\n\n`,
              ),
            )
          }
        } catch {
          failCount++
          if (failCount >= 3) {
            cleanup()
            try { controller.close() } catch { /* already closed */ }
            return
          }
        }

        // Schedule next poll only after current one completes
        if (!stopped) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      }

      // Start first poll after a short delay
      pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
