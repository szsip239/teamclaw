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

  // Seed RAG SystemConfig defaults
  const ragConfigs = [
    {
      key: 'rag.llm.baseUrl',
      value: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      description: 'LLM API base URL for RAG answer generation',
    },
    { key: 'rag.llm.apiKey', value: '', description: 'LLM API key (encrypted at rest)' },
    { key: 'rag.llm.model', value: 'qwen-plus', description: 'LLM model name for RAG answers' },
    {
      key: 'rag.embedding.baseUrl',
      value: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      description: 'Embedding API base URL',
    },
    {
      key: 'rag.embedding.apiKey',
      value: '',
      description: 'Embedding API key (encrypted at rest)',
    },
    { key: 'rag.embedding.model', value: 'text-embedding-v3', description: 'Embedding model name' },
    { key: 'rag.rerank.enabled', value: false, description: 'Enable reranking for RAG queries' },
    {
      key: 'rag.rerank.baseUrl',
      value: 'https://api.siliconflow.cn/v1',
      description: 'Reranking API base URL',
    },
    { key: 'rag.rerank.apiKey', value: '', description: 'Reranking API key (encrypted at rest)' },
    {
      key: 'rag.rerank.model',
      value: 'BAAI/bge-reranker-v2-m3',
      description: 'Reranking model name',
    },
    {
      key: 'rag.ocr.model',
      value: 'qwen-vl-max',
      description: 'Default OCR model for document processing',
    },
    { key: 'rag.ocr.workers', value: 4, description: 'Number of parallel OCR workers' },
    { key: 'rag.serviceUrl', value: 'http://rag:8000', description: 'Internal RAG service URL' },
  ]

  for (const cfg of ragConfigs) {
    await prisma.systemConfig.upsert({
      where: { key: cfg.key },
      update: {},
      create: {
        key: cfg.key,
        value: cfg.value as never,
        description: cfg.description,
      },
    })
  }
  console.log(`Seeded ${ragConfigs.length} RAG SystemConfig entries`)

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
