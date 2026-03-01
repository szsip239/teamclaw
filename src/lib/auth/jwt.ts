import { SignJWT, jwtVerify, importPKCS8, importSPKI } from 'jose'

const ALG = 'RS256'
const ISSUER = 'teamclaw'
const ACCESS_EXPIRY = '180m'
const REFRESH_EXPIRY = '7d'

let privateKey: CryptoKey | null = null
let publicKey: CryptoKey | null = null

async function getPrivateKey(): Promise<CryptoKey> {
  if (privateKey) return privateKey
  const pem = Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64').toString(
    'utf-8'
  )
  privateKey = await importPKCS8(pem, ALG)
  return privateKey
}

async function getPublicKey(): Promise<CryptoKey> {
  if (publicKey) return publicKey
  const pem = Buffer.from(process.env.JWT_PUBLIC_KEY!, 'base64').toString(
    'utf-8'
  )
  publicKey = await importSPKI(pem, ALG)
  return publicKey
}

export async function signAccessToken(payload: {
  userId: string
  role: string
}): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ userId: payload.userId, role: payload.role })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(ACCESS_EXPIRY)
    .sign(key)
}

export async function signRefreshToken(userId: string): Promise<string> {
  const key = await getPrivateKey()
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(REFRESH_EXPIRY)
    .sign(key)
}

export async function verifyAccessToken(
  token: string
): Promise<{ userId: string; role: string } | null> {
  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER })
    if (!payload.userId || !payload.role) return null
    return { userId: payload.userId as string, role: payload.role as string }
  } catch {
    return null
  }
}

export async function verifyRefreshToken(
  token: string
): Promise<{ userId: string } | null> {
  try {
    const key = await getPublicKey()
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER })
    if (!payload.userId) return null
    return { userId: payload.userId as string }
  } catch {
    return null
  }
}

export { getPublicKey }
