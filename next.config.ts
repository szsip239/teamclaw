import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['ioredis', 'bcryptjs', 'ws', 'dockerode'],
}

export default nextConfig
