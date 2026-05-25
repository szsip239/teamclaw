import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { runCheckForTracker, runCheckForUser } from '@/lib/regulation/check'

/**
 * Internal endpoint for the regulation-tracker skill (and future cron callers).
 * Authn = shared service token via `x-service-token` header. The token is
 * configured at deployment time as REGULATION_SKILL_TOKEN (falls back to
 * RAG_SERVICE_SECRET so existing deployments need zero new config).
 *
 * The caller MUST identify the acting user — we never inspect cookies here.
 * Either `userId` or `userEmail` is required (userEmail is more skill-author
 * friendly because the user can paste it from their TeamClaw profile).
 */

const bodySchema = z
  .object({
    userId: z.string().optional(),
    userEmail: z.string().email().optional(),
    trackerId: z.string().optional(),
  })
  .refine((v) => !!(v.userId || v.userEmail), {
    message: 'userId or userEmail is required',
  })

function authorize(req: NextRequest): boolean {
  const expected =
    process.env.REGULATION_SKILL_TOKEN || process.env.RAG_SERVICE_SECRET || ''
  if (!expected) return false
  const provided = req.headers.get('x-service-token') ?? ''
  // Length-safe equality is enough here — the secret comes from env.
  return provided.length > 0 && provided === expected
}

export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let json: unknown
  try {
    json = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'invalid' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: parsed.data.userId
      ? { id: parsed.data.userId }
      : { email: parsed.data.userEmail! },
    select: { id: true, name: true, email: true },
  })
  if (!user) {
    return NextResponse.json({ error: 'user not found' }, { status: 404 })
  }

  try {
    if (parsed.data.trackerId) {
      const tr = await prisma.regulationTracker.findUnique({
        where: { id: parsed.data.trackerId },
        select: { userId: true },
      })
      if (!tr || tr.userId !== user.id) {
        return NextResponse.json({ error: 'tracker not found for user' }, { status: 404 })
      }
      const r = await runCheckForTracker(parsed.data.trackerId)
      return NextResponse.json({ ranAt: new Date().toISOString(), results: [r] })
    }
    const results = await runCheckForUser(user.id)
    return NextResponse.json({ ranAt: new Date().toISOString(), results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'check failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
