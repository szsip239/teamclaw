import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { resolveRequestUserId } from '@/lib/middleware/auth'
import { dockerManager } from '@/lib/docker/manager'
import {
  buildSessionInputPath,
  buildSessionOutputPath,
} from '@/lib/session-files/helpers'

const POLL_INTERVAL_MS = 5_000

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
  let timer: ReturnType<typeof setInterval> | null = null
  let lastMtime = ''

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connected event
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected' })}\n\n`),
      )

      let failCount = 0

      // Poll directory mtime via docker exec
      timer = setInterval(async () => {
        try {
          // Use shell to suppress stat errors when directories don't exist yet.
          // `|| true` ensures zero exit code; `2>/dev/null` hides stderr.
          // Positional params ($1, $2) avoid shell-injection from paths.
          const mtime = await dockerManager.execWithOutput(containerId, [
            'sh', '-c',
            'stat -c "%Y" "$1" "$2" 2>/dev/null || true',
            '_', inputDir, outputDir,
          ])
          failCount = 0 // reset on successful exec
          const trimmed = mtime.trim()
          if (!trimmed) return // directories don't exist yet — wait silently
          if (trimmed !== lastMtime) {
            lastMtime = trimmed
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: 'files-changed' })}\n\n`,
              ),
            )
          }
        } catch {
          // Docker exec failed (container stopped / removed / API error).
          // Tolerate transient failures; only close after 3 consecutive.
          failCount++
          if (failCount >= 3) {
            if (timer) clearInterval(timer)
            timer = null
            controller.close()
          }
        }
      }, POLL_INTERVAL_MS)
    },
    cancel() {
      if (timer) clearInterval(timer)
      timer = null
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
