import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/refresh',
  '/_next',
  '/favicon.ico',
  '/healthz',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith('/api/')
}

/**
 * Lightweight middleware — only checks for the presence of the access_token cookie.
 * JWT verification is delegated to the Go backend (api:3200) for API routes.
 * For page routes, we redirect to /login if no token cookie exists.
 *
 * The Go backend sets an httpOnly `access_token` cookie on login/refresh,
 * so cookie-based routing still works without the middleware doing verification.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  const hasToken = !!req.cookies.get('access_token')?.value

  if (!hasToken) {
    if (isApiRoute(pathname)) {
      // API calls without a cookie are rejected at the Go backend level.
      // Let them through here so the Go backend can return a proper 401.
      return NextResponse.next()
    }
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
