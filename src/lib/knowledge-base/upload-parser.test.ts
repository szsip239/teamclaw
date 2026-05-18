import { describe, expect, it } from 'vitest'
import {
  parseMultipartFile,
  validatePdfUpload,
} from './upload-parser'

const boundary = '----teamclaw-test-boundary'

function multipartBody(file: Buffer, ending = `\r\n--${boundary}--\r\n`) {
  return Buffer.concat([
    Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="report.pdf"',
        'Content-Type: application/pdf',
        '',
        '',
      ].join('\r\n'),
    ),
    file,
    Buffer.from(ending),
  ])
}

describe('knowledge base upload parser', () => {
  it('extracts a complete PDF file part', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\nstartxref\n12\n%%EOF\n')
    const parsed = parseMultipartFile(multipartBody(pdf), boundary)

    expect(parsed.fileName).toBe('report.pdf')
    expect(parsed.contentType).toBe('application/pdf')
    expect(parsed.buffer.equals(pdf)).toBe(true)
    expect(validatePdfUpload(parsed.buffer)).toEqual({ ok: true })
  })

  it('rejects a truncated multipart body instead of returning partial bytes', () => {
    const partialPdf = Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n')

    expect(() => parseMultipartFile(multipartBody(partialPdf, ''), boundary)).toThrow(
      /incomplete multipart/i,
    )
  })

  it('rejects PDFs that are missing the trailer markers found near EOF', () => {
    expect(validatePdfUpload(Buffer.from('%PDF-1.7\n1 0 obj\nendobj\n'))).toEqual({
      ok: false,
      error: 'Uploaded PDF appears incomplete or truncated. Please upload the full PDF again.',
    })
  })
})
