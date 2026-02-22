import { encrypt, decrypt } from '@/lib/auth/encryption'

/** Encrypt an API key for database storage */
export function encryptCredential(apiKey: string): string {
  return encrypt(JSON.stringify({ apiKey }))
}

/** Decrypt stored credentials and return the API key */
export function decryptCredential(encrypted: string): string {
  const parsed = JSON.parse(decrypt(encrypted)) as { apiKey: string }
  if (typeof parsed?.apiKey !== 'string' || !parsed.apiKey) {
    throw new Error('Decrypted credential missing apiKey field')
  }
  return parsed.apiKey
}

/**
 * Mask a credential for display.
 * Shows first 8 and last 3 characters: "sk-ant-a***abc"
 */
export function maskCredential(key: string): string {
  if (key.length <= 11) {
    // Too short to meaningfully mask — show first 4 + ***
    return key.slice(0, 4) + '***'
  }
  return key.slice(0, 8) + '***' + key.slice(-3)
}
