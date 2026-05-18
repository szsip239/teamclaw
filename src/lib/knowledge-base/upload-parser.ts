export interface ParsedUploadFile {
  fileName: string
  contentType: string
  buffer: Buffer
}

export type PdfUploadValidation =
  | { ok: true }
  | { ok: false; error: string }

const PDF_HEADER_SCAN_BYTES = 1024
const PDF_TRAILER_SCAN_BYTES = 1024 * 1024

/**
 * Extract the first `file` part from a multipart/form-data payload.
 *
 * The parser intentionally refuses bodies without the next/closing boundary.
 * Next's proxy layer can otherwise hand us a 10MB prefix of a larger upload,
 * and accepting EOF as the part boundary would persist a corrupt PDF.
 */
export function parseMultipartFile(buf: Buffer, boundary: string): ParsedUploadFile {
  if (!boundary) throw new Error('multipart boundary not found')

  const boundaryLine = Buffer.from(`--${boundary}`)
  const boundaryPrefix = Buffer.from(`\r\n--${boundary}`)
  const headerSeparator = Buffer.from('\r\n\r\n')
  const lineEnd = Buffer.from('\r\n')
  const closing = Buffer.from('--')

  let pos = buf.indexOf(boundaryLine)
  if (pos === -1) throw new Error('multipart boundary not found')

  pos += boundaryLine.length
  if (startsWith(buf, closing, pos)) throw new Error('no file part found in multipart body')
  if (!startsWith(buf, lineEnd, pos)) throw new Error('malformed multipart boundary')
  pos += lineEnd.length

  while (pos < buf.length) {
    const headerEnd = buf.indexOf(headerSeparator, pos)
    if (headerEnd === -1) throw new Error('malformed part headers')

    const headerBlock = buf.subarray(pos, headerEnd).toString('utf-8')
    const bodyStart = headerEnd + headerSeparator.length
    const nextBoundary = buf.indexOf(boundaryPrefix, bodyStart)

    if (nextBoundary === -1) {
      throw new Error('incomplete multipart body')
    }

    const markerStart = nextBoundary + lineEnd.length
    const markerEnd = markerStart + boundaryLine.length
    const afterMarker = markerEnd
    const isClosingBoundary = startsWith(buf, closing, afterMarker)
    const hasNextPart = startsWith(buf, lineEnd, afterMarker)
    const isFilePart = /Content-Disposition:\s*form-data;[^\r\n]*\bname="file"/i.test(
      headerBlock,
    )

    if (isFilePart) {
      return {
        fileName: parseFileName(headerBlock),
        contentType: parseContentType(headerBlock),
        buffer: buf.subarray(bodyStart, nextBoundary),
      }
    }

    if (isClosingBoundary) break
    if (!hasNextPart) throw new Error('malformed multipart boundary')
    pos = afterMarker + lineEnd.length
  }

  throw new Error('no file part found in multipart body')
}

export function validatePdfUpload(buffer: Buffer): PdfUploadValidation {
  const header = buffer
    .subarray(0, Math.min(buffer.length, PDF_HEADER_SCAN_BYTES))
    .toString('latin1')

  if (!header.includes('%PDF-')) {
    return { ok: false, error: 'Uploaded file is not a valid PDF.' }
  }

  const trailer = buffer
    .subarray(Math.max(0, buffer.length - PDF_TRAILER_SCAN_BYTES))
    .toString('latin1')

  if (!trailer.includes('startxref') || !trailer.includes('%%EOF')) {
    return {
      ok: false,
      error: 'Uploaded PDF appears incomplete or truncated. Please upload the full PDF again.',
    }
  }

  return { ok: true }
}

function parseFileName(headerBlock: string): string {
  const fnStar = headerBlock.match(/filename\*=UTF-8''([^;\r\n]+)/i)
  if (fnStar?.[1]) {
    return decodeURIComponent(fnStar[1].trim().replace(/^"|"$/g, ''))
  }

  const filename = headerBlock.match(/filename="([^"]*)"/i)
  return filename?.[1] || 'upload.pdf'
}

function parseContentType(headerBlock: string): string {
  const contentType = headerBlock.match(/Content-Type:\s*([^\s;\r\n]+)/i)
  return contentType?.[1] || 'application/octet-stream'
}

function startsWith(buf: Buffer, needle: Buffer, offset: number): boolean {
  return buf.subarray(offset, offset + needle.length).equals(needle)
}
