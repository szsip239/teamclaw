import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma'
import bcrypt from 'bcryptjs'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Create default department
  const department = await prisma.department.upsert({
    where: { name: '系统管理部' },
    update: {},
    create: {
      name: '系统管理部',
      description: 'System Administration Department',
    },
  })
  console.log('Created department:', department.name)

  // Create admin user
  const passwordHash = await bcrypt.hash('Admin@123456', 12)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@teamclaw.local' },
    update: {},
    create: {
      email: 'admin@teamclaw.local',
      name: 'System Admin',
      passwordHash,
      role: 'SYSTEM_ADMIN',
      departmentId: department.id,
      status: 'ACTIVE',
    },
  })
  console.log('Created admin user:', admin.email)

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error('Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
