import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openUploadedFile, resolveUploadedFilePath } from './file-storage'

const tempDirs: string[] = []

async function makeStorageRoot() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'teamclaw-kb-files-'))
  tempDirs.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('knowledge base uploaded file fallback', () => {
  it('opens the original upload when the RAG artifact copy is unavailable', async () => {
    const root = await makeStorageRoot()
    const filePath = resolveUploadedFilePath('kb-1', 'report (final).pdf', root)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from('%PDF-original'))

    const opened = await openUploadedFile('kb-1', 'report (final).pdf', null, root)

    expect(opened?.status).toBe(200)
    expect(opened?.size).toBe(13)
    expect(opened?.contentRange).toBeNull()
    await expect(new Response(opened!.body).text()).resolves.toBe('%PDF-original')
  })

  it('preserves byte-range responses used by PDF viewers', async () => {
    const root = await makeStorageRoot()
    const filePath = resolveUploadedFilePath('kb-1', 'report.pdf', root)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, Buffer.from('0123456789'))

    const opened = await openUploadedFile('kb-1', 'report.pdf', 'bytes=2-5', root)

    expect(opened?.status).toBe(206)
    expect(opened?.size).toBe(4)
    expect(opened?.contentRange).toBe('bytes 2-5/10')
    await expect(new Response(opened!.body).text()).resolves.toBe('2345')
  })

  it('returns null when the original upload no longer exists', async () => {
    const root = await makeStorageRoot()

    await expect(openUploadedFile('kb-1', 'missing.pdf', null, root)).resolves.toBeNull()
  })
})
