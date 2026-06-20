#!/usr/bin/env node
/**
 * Generate RSA key pair for JWT RS256 and AES encryption key.
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
  return !value || value.startsWith('<')
}

function setEnvValue(content, key, value) {
  const line = `${key}="${value}"`
  if (new RegExp(`^${key}=`, 'm').test(content)) {
    return content.replace(new RegExp(`^${key}=.*$`, 'm'), line)
  }
  return `${content.replace(/\s*$/, '')}\n${line}\n`
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
  --force   Rotate existing values intentionally`)
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
}

main().catch(console.error)
