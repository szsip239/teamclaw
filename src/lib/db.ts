import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma'

const globalForDb = globalThis as unknown as {
  pgPool: Pool
  prisma: PrismaClient
}

function getPool() {
  if (!globalForDb.pgPool) {
    globalForDb.pgPool = new Pool({ connectionString: process.env.DATABASE_URL })
  }
  return globalForDb.pgPool
}

function createPrismaClient() {
  const adapter = new PrismaPg(getPool())
  return new PrismaClient({ adapter })
}

// In dev, always recreate PrismaClient to pick up schema changes after `prisma generate`.
// The pg Pool is cached separately to avoid connection exhaustion.
export const prisma =
  process.env.NODE_ENV === 'production'
    ? (globalForDb.prisma || (globalForDb.prisma = createPrismaClient()))
    : createPrismaClient()
