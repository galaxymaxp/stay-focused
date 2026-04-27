import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import JSZip from 'jszip'
import { resolveCanvasContentForWorkspaceItem } from '../lib/canvas-content-resolution'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

test('assignment with body text only keeps readable instructions in the shared normalized shape', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Learning Contract',
    sourceType: 'assignment',
    mimeType: 'text/html',
    dueAt: '2026-04-20T09:00:00.000Z',
    sections: [
      {
        label: 'Instructions',
        html: '<p>Write one handwritten learning contract.</p><p>Include Expectations, Contributions, Motivations, and Hindrances.</p>',
      },
    ],
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.equal(resolved.content.fallbackState, null)
  assert.equal(resolved.content.recommendationStrength, 'strong')
  assert.equal(resolved.content.dueAt, '2026-04-20T09:00:00.000Z')
  assert.match(resolved.content.textContent, /handwritten learning contract/i)
  assert.match(resolved.content.textContent, /Expectations, Contributions/i)
  assert.equal(resolved.persisted.extractionStatus, 'extracted')
})

test('assignment with Canvas-linked attachment only resolves readable text from the attachment instead of staying blank', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Week 4 Reading Response',
    sourceType: 'assignment',
    mimeType: 'text/html',
    sections: [
      {
        label: 'Instructions',
        html: '<p><a href="https://canvas.example/courses/42/files/88/download">Week 4 Handout.pdf</a></p>',
      },
    ],
  }, {
    downloadAttachment: async (input) => {
      assert.equal(input.canvasFileId, 88)
      return {
        buffer: await createTextPdfBuffer(),
        contentType: 'application/pdf',
        title: 'Week 4 Handout.pdf',
        extension: 'pdf',
      }
    },
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.equal(resolved.content.fallbackState, 'attachment_only')
  assert.equal(resolved.content.attachments.length, 1)
  assert.equal(resolved.content.attachments[0]?.sourceType, 'canvas_file')
  assert.ok(resolved.content.textContent.length > 0)
  assert.match(resolved.persisted.extractionError ?? '', /attachments rather than the body/i)
})

test('discussion with long instructions stays readable without attachment fetches', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Week 6 Forum',
    sourceType: 'discussion',
    mimeType: 'text/html',
    postedAt: '2026-04-12T10:00:00.000Z',
    sections: [
      {
        label: 'Prompt',
        html: [
          '<p>Explain the tradeoff between flexibility and consistency in interface design.</p>',
          '<p>Use one real product example and one classroom example in your response.</p>',
          '<p>Reply to two classmates with a concrete improvement suggestion.</p>',
        ].join(''),
      },
    ],
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.equal(resolved.content.postedAt, '2026-04-12T10:00:00.000Z')
  assert.match(resolved.content.textContent, /flexibility and consistency/i)
  assert.match(resolved.content.textContent, /Reply to two classmates/i)
})

test('module item linking to a pdf extracts readable text through the shared file path', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Lecture Notes.pdf',
    sourceType: 'file',
    mimeType: 'application/pdf',
    extension: 'pdf',
    file: {
      title: 'Lecture Notes.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      buffer: await createTextPdfBuffer(),
    },
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.equal(resolved.content.sourceType, 'file')
  assert.ok(resolved.content.textContent.length > 0)
})

test('image-only pdfs become OCR-available instead of failed', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Scanned Notes.pdf',
    sourceType: 'file',
    mimeType: 'application/pdf',
    extension: 'pdf',
    file: {
      title: 'Scanned Notes.pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
      buffer: createImageOnlyPdfBuffer(),
    },
  })

  assert.equal(resolved.content.extractionStatus, 'no_text')
  assert.equal(resolved.persisted.extractionStatus, 'empty')
  assert.equal(resolved.persisted.extractedCharCount, 0)
  assert.equal(resolved.persisted.visualExtractionStatus, 'available')
  assert.equal(resolved.persisted.pageCount, 1)
  assert.match(resolved.persisted.extractionError ?? '', /pdf_image_only_possible/)
})

test('docx files are extracted into normalized readable text', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Lab Guide.docx',
    sourceType: 'file',
    mimeType: DOCX_MIME,
    extension: 'docx',
    file: {
      title: 'Lab Guide.docx',
      mimeType: DOCX_MIME,
      extension: 'docx',
      buffer: await createDocxBuffer('Document the experiment setup and list the measured variables.'),
    },
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.match(resolved.content.textContent, /experiment setup/i)
})

test('pptx files are extracted into normalized readable text', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Week 3 Slides.pptx',
    sourceType: 'file',
    mimeType: PPTX_MIME,
    extension: 'pptx',
    file: {
      title: 'Week 3 Slides.pptx',
      mimeType: PPTX_MIME,
      extension: 'pptx',
      buffer: await createPptxBuffer('Differentiate formative assessment from summative assessment.'),
    },
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.match(resolved.content.textContent, /formative assessment/i)
})

test('legacy ppt files stay explicitly unsupported instead of looking empty', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Old Slides.ppt',
    sourceType: 'file',
    mimeType: 'application/vnd.ms-powerpoint',
    extension: 'ppt',
    file: {
      title: 'Old Slides.ppt',
      mimeType: 'application/vnd.ms-powerpoint',
      extension: 'ppt',
      buffer: Buffer.from('legacy-ppt-binary', 'utf8'),
    },
  })

  assert.equal(resolved.content.extractionStatus, 'unsupported')
  assert.equal(resolved.content.fallbackState, 'unsupported_file_type')
  assert.equal(resolved.persisted.extractionStatus, 'unsupported')
  assert.match(resolved.persisted.extractionError ?? '', /legacy \.ppt/i)
})

test('announcement with no deadline keeps body text and leaves dueAt null', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Class Suspended Tomorrow',
    sourceType: 'announcement',
    mimeType: 'text/html',
    sections: [
      {
        label: 'Announcement',
        html: '<p>Classes are suspended tomorrow due to the campus-wide event.</p><p>Use the time to review Week 5 materials.</p>',
      },
    ],
  })

  assert.equal(resolved.content.extractionStatus, 'success')
  assert.equal(resolved.content.dueAt, null)
  assert.match(resolved.content.textContent, /campus-wide event/i)
})

test('external-link-only content is marked as link-only fallback instead of parsed text', async () => {
  const resolved = await resolveCanvasContentForWorkspaceItem({
    title: 'Reference Video',
    sourceType: 'external_link',
    mimeType: 'text/html',
    attachments: [
      {
        name: 'Reference Video',
        url: 'https://example.com/watch?v=123',
        sourceType: 'external_link',
      },
    ],
  })

  assert.equal(resolved.content.extractionStatus, 'unsupported')
  assert.equal(resolved.content.fallbackState, 'external_link_only')
  assert.equal(resolved.content.recommendationStrength, 'fallback')
  assert.equal(resolved.content.textContent, '')
  assert.match(resolved.persisted.extractionError ?? '', /external link/i)
})

async function createDocxBuffer(text: string) {
  const zip = new JSZip()
  zip.file('word/document.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body>',
    `<w:p><w:r><w:t>${escapeXml(text)}</w:t></w:r></w:p>`,
    '</w:body>',
    '</w:document>',
  ].join(''))

  return zip.generateAsync({ type: 'nodebuffer' })
}

async function createPptxBuffer(text: string) {
  const zip = new JSZip()
  zip.file('ppt/slides/slide1.xml', [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">',
    '<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>',
    escapeXml(text),
    '</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>',
    '</p:sld>',
  ].join(''))

  return zip.generateAsync({ type: 'nodebuffer' })
}

async function createTextPdfBuffer() {
  return readFile('node_modules/pdf-parse/test/data/01-valid.pdf')
}

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

function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

