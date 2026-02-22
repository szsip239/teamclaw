import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-cbc'

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64 || !/^[0-9a-fA-F]+$/.test(keyHex)) {
    throw new Error(
      'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
      'Generate one with: openssl rand -hex 32'
    )
  }
  return Buffer.from(keyHex, 'hex')
}

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getKey(), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${iv.toString('hex')}:${encrypted}`
}

export function decrypt(encrypted: string): string {
  const colonIdx = encrypted.indexOf(':')
  if (colonIdx === -1) {
    throw new Error('Invalid encrypted format: missing IV separator')
  }
  const ivHex = encrypted.slice(0, colonIdx)
  const encryptedHex = encrypted.slice(colonIdx + 1)
  if (!ivHex || !encryptedHex) {
    throw new Error('Invalid encrypted format: empty IV or ciphertext')
  }
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv)
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}
