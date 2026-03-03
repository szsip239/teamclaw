import type { NextConfig } from 'next'

// INTERNAL_API_URL is used by Next.js server-side rewrites to proxy /api/v1/* to the Go backend.
// In production Docker Compose: set to http://api:3200 (internal Docker network).
// In development: NEXT_PUBLIC_API_URL=http://localhost:3200 is used instead (direct browser call).
// If neither is set, defaults to http://localhost:3200.
const internalApiUrl = process.env.INTERNAL_API_URL ?? 'http://localhost:3200'

const nextConfig: NextConfig = {
  output: 'standalone',

  // Proxy /api/v1/* to the Go backend via Next.js server-side rewrites.
  // This removes the need for Nginx in simple HTTP deployments.
  // The rewrite is transparent to the browser — it sees the same URL.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${internalApiUrl}/api/v1/:path*`,
      },
      {
        source: '/healthz',
        destination: `${internalApiUrl}/healthz`,
      },
    ]
  },
}

export default nextConfig
