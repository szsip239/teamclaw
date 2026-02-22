import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify, importSPKI } from 'jose'

const ALG = 'RS256'
const ISSUER = 'teamclaw'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/_next',
  '/favicon.ico',
]

let cachedPublicKey: CryptoKey | null = null

async function getPublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey
  const pem = Buffer.from(process.env.JWT_PUBLIC_KEY!, 'base64').toString(
    'utf-8'
  )
  cachedPublicKey = await importSPKI(pem, ALG)
  return cachedPublicKey
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const token = req.cookies.get('access_token')?.value

  if (!token) {
    if (isApiRoute(pathname)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER })

    if (!payload.userId || !payload.role) {
      throw new Error('Invalid token payload')
    }

    const headers = new Headers(req.headers)
    headers.set('x-user-id', payload.userId as string)
    headers.set('x-user-role', payload.role as string)
    if (payload.email) {
      headers.set('x-user-email', payload.email as string)
    }

    return NextResponse.next({ request: { headers } })
  } catch {
    if (isApiRoute(pathname)) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      )
    }
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
