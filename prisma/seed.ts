import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma'
import bcrypt from 'bcryptjs'
import fs from 'fs/promises'
import path from 'path'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// ─── YAML frontmatter parser (minimal) ──────────────────────────────
// SKILL.md files use `--- ... ---` with simple `key: value` pairs + some
// inline JSON metadata. Full YAML is overkill; we extract only the fields
// the Skill model needs (name, description, emoji, version, tags, homepage).
function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/)
  if (!m) return {}
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/)
    if (!kv) continue
    const [, key, rawValue] = kv
    // Strip surrounding quotes, ignore multiline / list / JSON values for
    // this minimal parser — callers only read simple string scalars.
    let v = rawValue.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[key] = v
  }
  return out
}

/**
 * Seed reference skills from data/skills/<slug>/SKILL.md.
 * Upsert by slug: existing skills are never overwritten (preserves user
 * edits). Only runs when the skill directory is present in the container
 * image — see Dockerfile init stage + .dockerignore.
 */
async function seedSkills(adminId: string): Promise<void> {
  const skillsDir = path.resolve('data/skills')
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true })
  } catch (err) {
    console.log(`[skills] no data/skills dir — skipping (${(err as Error).message})`)
    return
  }

  let created = 0
  let skipped = 0
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const slug = entry.name
    const mdPath = path.join(skillsDir, slug, 'SKILL.md')
    let md: string
    try {
      md = await fs.readFile(mdPath, 'utf-8')
    } catch {
      continue
    }
    const fm = parseFrontmatter(md)
    const name = fm.name || slug
    const description = fm.description || null
    // Skip upsert if slug already present (never overwrite user state)
    const existing = await prisma.skill.findUnique({ where: { slug } })
    if (existing) {
      skipped++
      continue
    }
    await prisma.skill.create({
      data: {
        slug,
        name,
        description,
        emoji: fm.emoji || null,
        homepage: fm.homepage || null,
        version: fm.version || '0.1.0',
        category: 'DEFAULT',
        source: 'LOCAL',
        creatorId: adminId,
      },
    })
    created++
  }
  console.log(`[skills] seeded ${created} new skills (${skipped} already existed, preserved)`)
}

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

  // Seed bundled reference skills
  await seedSkills(admin.id)

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
