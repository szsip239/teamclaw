#!/usr/bin/env node
/**
 * Generate RSA key pair for JWT RS256 and AES encryption key.
 * Outputs Base64-encoded values ready for .env file.
 */
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'
import { randomBytes } from 'crypto'

async function main() {
  console.log('Generating RS256 key pair for JWT...\n')

  const { publicKey, privateKey } = await generateKeyPair('RS256', {
    extractable: true,
  })

  const privatePem = await exportPKCS8(privateKey)
  const publicPem = await exportSPKI(publicKey)

  const privateB64 = Buffer.from(privatePem).toString('base64')
  const publicB64 = Buffer.from(publicPem).toString('base64')
  const encryptionKey = randomBytes(32).toString('hex')

  console.log('# Add these to your .env file:\n')
  console.log(`JWT_PRIVATE_KEY="${privateB64}"`)
  console.log(`JWT_PUBLIC_KEY="${publicB64}"`)
  console.log(`ENCRYPTION_KEY="${encryptionKey}"`)
}

main().catch(console.error)
