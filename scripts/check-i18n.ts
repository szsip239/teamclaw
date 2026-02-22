/**
 * Locale Key Sync Checker
 *
 * Compares en.ts and zh-CN.ts translation files to find missing keys.
 * Usage: npx tsx scripts/check-i18n.ts
 *
 * Exit code 0 = in sync, 1 = keys mismatch.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = path.resolve(__dirname, '../src/locales')

function extractKeys(filePath: string): Set<string> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const keys = new Set<string>()
  // Match lines like  'some.key': '...' or "some.key": "..."
  for (const match of content.matchAll(/['"]([a-zA-Z0-9_.]+)['"]\s*:/g)) {
    keys.add(match[1])
  }
  return keys
}

const zhFile = path.join(LOCALES_DIR, 'zh-CN.ts')
const enFile = path.join(LOCALES_DIR, 'en.ts')

if (!fs.existsSync(zhFile) || !fs.existsSync(enFile)) {
  console.error('Missing locale files. Expected zh-CN.ts and en.ts in src/locales/')
  process.exit(1)
}

const zhKeys = extractKeys(zhFile)
const enKeys = extractKeys(enFile)

const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k))
const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k))

let hasIssues = false

if (missingInEn.length > 0) {
  console.log(`\n❌ Missing in en.ts (${missingInEn.length} keys):`)
  for (const key of missingInEn) console.log(`  - ${key}`)
  hasIssues = true
}

if (missingInZh.length > 0) {
  console.log(`\n❌ Missing in zh-CN.ts (${missingInZh.length} keys):`)
  for (const key of missingInZh) console.log(`  - ${key}`)
  hasIssues = true
}

if (!hasIssues) {
  console.log(`✅ Locale files are in sync (${zhKeys.size} keys)`)
}

process.exit(hasIssues ? 1 : 0)
