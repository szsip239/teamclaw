import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  path.resolve('src/components/knowledge-bases/kb-document-row.tsx'),
  'utf-8',
)

const originalSheetSource = readFileSync(
  path.resolve('src/components/knowledge-bases/kb-document-original-sheet.tsx'),
  'utf-8',
)

describe('KbDocumentRow ingestion progress visibility', () => {
  it('keeps ingestion logs visible for failed documents that still have a job id', () => {
    expect(source).toContain('doc.status === "FAILED"')
    expect(source).toContain('KbIngestionLog')
  })

  it('exposes the reference-style document actions', () => {
    expect(source).toContain("t('kb.indexInfo')")
    expect(source).toContain("t('kb.viewOriginal')")
    expect(source).toContain("t('kb.rebuildIndex')")
    expect(source).toContain('KbDocumentOriginalSheet')
    expect(source).toContain('setOriginalOpen(true)')
  })

  it('renders the reference-style index profile fields', () => {
    expect(source).toContain('doc.indexInfo')
    expect(source).toContain('summary')
    expect(source).toContain('chapterSummary')
    expect(source).toContain('keywords')
    expect(source).toContain('titleAliases')
    expect(source).toContain('profileDetail')
  })

  it('previews the original document in a narrower persistent right-side drawer', () => {
    expect(originalSheetSource).toContain('sm:w-[min(41vw,680px)]')
    expect(originalSheetSource).toContain('translate-x-full')
    expect(originalSheetSource).toContain('translate-x-0')
    expect(originalSheetSource).toContain('shouldRenderContent')
    expect(originalSheetSource).toContain('<iframe')
    expect(originalSheetSource).toContain('page?: number | null')
    expect(originalSheetSource).toContain('#page=${targetPage}&toolbar=1&view=FitH')
    expect(originalSheetSource).toContain("t('kb.openOriginalInNewTab')")
  })
})
