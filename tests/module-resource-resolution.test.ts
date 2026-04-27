import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyCanvasTargetUrl,
  resolveCanvasLinkedTarget,
} from '../lib/canvas'
import { buildCanvasContentPlaceholderResult } from '../lib/canvas-content-resolution'
import { getModuleResourceQualityInfo } from '../lib/module-resource-quality'

test('module item redirect resolves to an underlying Canvas page target before extraction', async (t) => {
  const originalFetch = global.fetch

  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/module_item_redirect/')) {
      return new Response(null, {
        status: 302,
        headers: {
          location: 'https://canvas.example/courses/42/pages/ciphertext-unit-43',
        },
      })
    }

    return new Response('<html><body>resolved</body></html>', {
      status: 200,
      headers: {
        'content-type': 'text/html',
      },
    })
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const resolved = await resolveCanvasLinkedTarget(
    'https://canvas.example/api/v1/courses/42/module_item_redirect/2438662',
    {
      url: 'https://canvas.example',
      token: 'canvas-token',
    },
  )

  assert.equal(resolved.resolutionState, 'resolved')
  assert.equal(resolved.resolvedTargetType, 'page')
  assert.equal(resolved.resolvedUrlCategory, 'canvas_page')
  assert.equal(resolved.courseId, 42)
  assert.equal(resolved.pageUrl, 'ciphertext-unit-43')
})

test('module item redirect resolves to an underlying Canvas file target before extraction', async (t) => {
  const originalFetch = global.fetch

  global.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/module_item_redirect/')) {
      return new Response(null, {
        status: 302,
        headers: {
          location: 'https://canvas.example/courses/42/files/88/download?download_frd=1',
        },
      })
    }

    return new Response(null, {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
      },
    })
  }

  t.after(() => {
    global.fetch = originalFetch
  })

  const resolved = await resolveCanvasLinkedTarget(
    'https://canvas.example/api/v1/courses/42/module_item_redirect/2544884',
    {
      url: 'https://canvas.example',
      token: 'canvas-token',
    },
  )

  assert.equal(resolved.resolutionState, 'resolved')
  assert.equal(resolved.resolvedTargetType, 'file')
  assert.equal(resolved.resolvedUrlCategory, 'canvas_file')
  assert.equal(resolved.fileId, 88)
})

test('internal Canvas module links stay explicit when auth is still required for target resolution', async () => {
  const resolved = await resolveCanvasLinkedTarget(
    'https://canvas.example/api/v1/courses/42/module_item_redirect/2438662',
    {
      url: 'https://canvas.example',
    },
  )

  assert.equal(resolved.resolutionState, 'canvas_resolution_required')
  assert.equal(resolved.resolvedTargetType, 'unknown')
  assert.match(resolved.reason ?? '', /auth is required/i)
})

test('external links remain honestly link-only during target resolution', async () => {
  const resolved = await resolveCanvasLinkedTarget('https://example.com/reference-video')

  assert.equal(resolved.resolutionState, 'external_link_only')
  assert.equal(resolved.resolvedTargetType, 'external_link')
  assert.equal(resolved.resolvedUrlCategory, 'external')
})

test('unresolved Canvas dependencies persist a specific fallback reason instead of collapsing to generic weak state', async () => {
  const placeholder = buildCanvasContentPlaceholderResult({
    title: 'Canvas LMS Walkthrough',
    sourceType: 'module_item',
    extractionStatus: 'partial',
    fallbackState: 'canvas_resolution_required',
    recommendationStrength: 'fallback',
    warnings: ['Canvas auth is required before this internal module link can resolve to its real target.'],
  })

  assert.equal(placeholder.persisted.extractionStatus, 'metadata_only')
  assert.equal(placeholder.persisted.metadataPatch.fallbackReason, 'canvas_resolution_required')
  assert.equal(placeholder.persisted.metadataPatch.recommendationStrength, 'fallback')
  assert.match(placeholder.persisted.extractionError ?? '', /real target/i)
})

test('preview-only extracts stay distinct from full stored text and long noisy PDF-like extracts stay usable', () => {
  const fullTextResource = {
    type: 'File',
    extension: 'pdf',
    contentType: 'application/pdf',
    extractionStatus: 'extracted' as const,
    extractedText: buildLongStructuredPdfLikeText(),
    extractedTextPreview: 'Cybercrime Methods Unit 4.2',
    extractedCharCount: 6200,
    extractionError: null,
    metadata: {
      normalizedSourceType: 'file',
    },
  }

  const previewOnlyResource = {
    type: 'File',
    extension: 'pdf',
    contentType: 'application/pdf',
    extractionStatus: 'extracted' as const,
    extractedText: null,
    extractedTextPreview: 'Only the stored preview is available here.',
    extractedCharCount: 38,
    extractionError: null,
    metadata: {
      normalizedSourceType: 'file',
    },
  }

  const fullTextQuality = getModuleResourceQualityInfo(fullTextResource)
  const previewOnlyQuality = getModuleResourceQualityInfo(previewOnlyResource)

  assert.equal(fullTextQuality.previewState, 'full_text_available')
  assert.equal(fullTextQuality.fullTextAvailable, true)
  assert.equal(fullTextQuality.quality, 'usable')
  assert.equal(previewOnlyQuality.previewState, 'preview_only')
  assert.equal(previewOnlyQuality.fullTextAvailable, false)
})

test('Canvas module item URLs classify as internal resolution targets instead of generic external links', () => {
  const classified = classifyCanvasTargetUrl(
    'https://canvas.example/courses/42/modules/items/2438662',
    'https://canvas.example',
  )

  assert.equal(classified.category, 'canvas_module_item')
  assert.equal(classified.targetType, 'unknown')
  assert.equal(classified.courseId, 42)
})

function buildLongStructuredPdfLikeText() {
  const repeatedHeader = [
    'Cybercrime Methods',
    'Unit 4.2',
  ].join('\n')

  const paragraphs = [
    'Cybercrime prevention depends on understanding the patterns that attackers use to exploit access, identity, and trust across digital systems.',
    'The Cybercrime Prevention Act of 2012 defines several offenses, but students still need to connect those legal categories to concrete attack behavior and common investigative evidence.',
    'Social engineering, phishing, credential theft, and malicious distribution campaigns often work because people trust familiar interfaces, messages, or authority signals without validating them carefully.',
    'A usable study note should separate the method, the target, the impact, and the defensive response so the learner can explain not just what happened but why the attack succeeded.',
    'Data privacy discussions also connect to cybercrime methods because unauthorized collection, interception, and disclosure often depend on the same technical and procedural weaknesses.',
    'When a reading repeats headings or unit labels, the extract can still be useful if the body paragraphs contain enough meaningful explanation, examples, and distinctions to support grounded study.',
    'Students should ask how each method works, which law or policy response applies, what evidence would surface in practice, and which prevention move would reduce the risk most effectively.',
    'That structure makes the source usable for Learn even when a PDF still includes some repeated slide-like framing or module labels across the extracted text.',
  ]

  return [
    repeatedHeader,
    paragraphs.join('\n\n'),
    repeatedHeader,
    paragraphs.join('\n\n'),
    repeatedHeader,
    paragraphs.slice(0, 4).join('\n\n'),
  ].join('\n\n')
}
