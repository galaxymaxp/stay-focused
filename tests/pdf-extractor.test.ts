import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { extractPdfTextFromBuffer } from '../lib/extraction/pdf-extractor'

test('server PDF adapter extracts text without browser runtime globals', async () => {
  const buffer = await readFile('node_modules/pdf-parse/test/data/01-valid.pdf')
  const result = await extractPdfTextFromBuffer(buffer)

  assert.notEqual(result.errorCode, 'pdf_runtime_missing_dom_matrix')
  assert.equal(result.status, 'extracted')
  assert.ok((result.pageCount ?? 0) > 0)
  assert.ok(result.text.length > 0)
  assert.ok(result.charCount > 0)
  assert.ok(result.quality.wordCount >= 20)
  assert.ok(result.quality.sentenceCount >= 2)
})

test('server PDF adapter rejects Canvas login or preview HTML downloaded as a PDF', async () => {
  const result = await extractPdfTextFromBuffer(Buffer.from([
    '<!doctype html>',
    '<html><head><title>Canvas Login</title></head>',
    '<body><form id="login_form">Sign in</form></body></html>',
  ].join(''), 'utf8'))

  assert.equal(result.status, 'failed')
  assert.equal(result.errorCode, 'pdf_downloaded_html_instead_of_pdf')
  assert.equal(result.charCount, 0)
})

test('server PDF adapter classifies image-only PDFs for OCR or visual fallback review', async () => {
  const result = await extractPdfTextFromBuffer(createImageOnlyPdfBuffer())

  assert.equal(result.status, 'empty')
  assert.equal(result.errorCode, 'pdf_image_only_possible')
  assert.equal(result.quality.imageOnlyPossible, true)
})

function createImageOnlyPdfBuffer() {
  const imageStream = '0000000000'
  return createPdfDocument([
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${Buffer.byteLength(imageStream, 'utf8')} >>\nstream\n${imageStream}endstream\nendobj\n`,
    '5 0 obj\n<< /Length 31 >>\nstream\nq\n100 0 0 100 0 0 cm\n/Im1 Do\nQ\nendstream\nendobj\n',
  ])
}

function createPdfDocument(objects: string[]) {
  let document = '%PDF-1.4\n'
  const offsets: number[] = [0]

  for (const object of objects) {
    offsets.push(Buffer.byteLength(document, 'utf8'))
    document += object
  }

  const xrefStart = Buffer.byteLength(document, 'utf8')
  document += `xref\n0 ${objects.length + 1}\n`
  document += '0000000000 65535 f \n'

  for (let index = 1; index <= objects.length; index += 1) {
    document += `${String(offsets[index] ?? 0).padStart(10, '0')} 00000 n \n`
  }

  document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return Buffer.from(document, 'utf8')
}
