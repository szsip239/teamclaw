import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    proxyClientMaxBodySize: '110mb',
  },
  serverExternalPackages: ['ioredis', 'bcryptjs', 'ws', 'dockerode', 'tar-stream'],
}

export default nextConfig
