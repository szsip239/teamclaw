import { NextResponse } from 'next/server'

export function GET() {
  const revision = process.env.TEAMCLAW_BUILD_REVISION?.trim()

  return NextResponse.json({
    status: 'ok',
    service: 'teamclaw-app',
    ...(revision && revision !== 'unknown' ? { revision } : {}),
  })
}
