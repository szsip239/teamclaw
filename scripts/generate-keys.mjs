#!/usr/bin/env node
/**
 * Generate TeamClaw local environment secrets.
 * Outputs Base64-encoded values, or writes missing placeholders with --write.
 */
import { generateKeyPairSync, randomBytes } from 'crypto'
import { readFile, writeFile } from 'fs/promises'

const ENV_FILE = '.env'
const ENV_EXAMPLE = '.env.example'

function stripQuotes(value) {
  return value.replace(/^"/, '').replace(/"$/, '')
}

function needsValue(content, key) {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'))
  if (!match) return true
  const value = stripQuotes(match[1].trim())
  return !value || value.includes('<')
}

function getEnvValue(content, key, fallback = '') {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'))
  if (!match) return fallback
  return stripQuotes(match[1].trim()) || fallback
}

function setEnvValue(content, key, value) {
  const line = `${key}="${value}"`
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    return content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  }
  return `${content.replace(/\s*$/, '')}\n${line}\n`
}

function randomSecret(bytes = 24) {
  return randomBytes(bytes).toString('base64url')
}

function buildDatabaseUrl(content, postgresPassword) {
  const user = getEnvValue(content, 'POSTGRES_USER', 'teamclaw')
  const db = getEnvValue(content, 'POSTGRES_DB', 'teamclaw')
  const port = getEnvValue(content, 'POSTGRES_PORT', '5432')
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(postgresPassword)}@localhost:${port}/${encodeURIComponent(db)}?schema=public`
}

async function readEnvContent() {
  try {
    return await readFile(ENV_FILE, 'utf8')
  } catch {
    try {
      return await readFile(ENV_EXAMPLE, 'utf8')
    } catch {
      throw new Error(`${ENV_FILE} not found and ${ENV_EXAMPLE} is unavailable`)
    }
  }
}

async function main() {
  const writeMode = process.argv.includes('--write')
  const force = process.argv.includes('--force')
  const help = process.argv.includes('--help') || process.argv.includes('-h')

  if (help) {
    console.log(`Usage: node scripts/generate-keys.mjs [--write] [--force]

Options:
  --write   Write missing placeholder values to .env
  --force   Rotate existing values intentionally; do not use on existing deployments unless planned`)
    return
  }

  console.log('Generating RS256 key pair for JWT...\n')

  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  })

  const privateB64 = Buffer.from(privateKey).toString('base64')
  const publicB64 = Buffer.from(publicKey).toString('base64')
  const encryptionKey = randomBytes(32).toString('hex')

  if (writeMode) {
    let content = await readEnvContent()
    let changed = false

    const postgresPassword = randomSecret(24)
    const ragServiceSecret = randomSecret(32)
    const initialAdminPassword = randomSecret(18)

    const shouldWriteJwt =
      force || needsValue(content, 'JWT_PRIVATE_KEY') || needsValue(content, 'JWT_PUBLIC_KEY')

    if (shouldWriteJwt) {
      content = setEnvValue(content, 'JWT_PRIVATE_KEY', privateB64)
      content = setEnvValue(content, 'JWT_PUBLIC_KEY', publicB64)
      changed = true
    }

    if (force || needsValue(content, 'ENCRYPTION_KEY')) {
      content = setEnvValue(content, 'ENCRYPTION_KEY', encryptionKey)
      changed = true
    }

    if (force || needsValue(content, 'POSTGRES_PASSWORD')) {
      content = setEnvValue(content, 'POSTGRES_PASSWORD', postgresPassword)
      if (force || needsValue(content, 'DATABASE_URL')) {
        content = setEnvValue(content, 'DATABASE_URL', buildDatabaseUrl(content, postgresPassword))
      }
      changed = true
    } else if (force || needsValue(content, 'DATABASE_URL')) {
      content = setEnvValue(
        content,
        'DATABASE_URL',
        buildDatabaseUrl(content, getEnvValue(content, 'POSTGRES_PASSWORD')),
      )
      changed = true
    }

    if (force || needsValue(content, 'RAG_SERVICE_SECRET')) {
      content = setEnvValue(content, 'RAG_SERVICE_SECRET', ragServiceSecret)
      changed = true
    }

    if (force || needsValue(content, 'INITIAL_ADMIN_PASSWORD')) {
      content = setEnvValue(content, 'INITIAL_ADMIN_PASSWORD', initialAdminPassword)
      changed = true
    }

    await writeFile(ENV_FILE, content)
    if (changed) {
      console.log(`Wrote missing keys to ${ENV_FILE}`)
    } else {
      console.log(
        `Existing keys in ${ENV_FILE} were preserved. Use --force only when rotating secrets intentionally.`,
      )
    }
    return
  }

  console.log('# Add these to your .env file:\n')
  console.log(`JWT_PRIVATE_KEY="${privateB64}"`)
  console.log(`JWT_PUBLIC_KEY="${publicB64}"`)
  console.log(`ENCRYPTION_KEY="${encryptionKey}"`)
  console.log(`POSTGRES_PASSWORD="${randomSecret(24)}"`)
  console.log(`RAG_SERVICE_SECRET="${randomSecret(32)}"`)
  console.log(`INITIAL_ADMIN_PASSWORD="${randomSecret(18)}"`)
}

main().catch(console.error)
