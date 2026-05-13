import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCleanModuleOverviewInput, cleanStudyTextForOverview } from '../lib/source-summaries'
import type { Module, ModuleResource } from '../lib/types'

test('clean overview text keeps meaningful academic text even when the source is short on headings', () => {
  const text = [
    'The CIA triad stands for confidentiality, integrity, and availability.',
    'Threat actors may include insiders, competitors, and cybercriminal groups.',
    'Malware symptoms include crashes, slowdown, and unusual CPU usage.',
  ].join('\n')

  const cleaned = cleanStudyTextForOverview(text)

  assert.match(cleaned, /CIA triad/i)
  assert.match(cleaned, /Malware symptoms/i)
})

test('module overview input treats meaningful readable resources as enough clean material', () => {
  const repeatedText = [
    'The CIA triad covers confidentiality, integrity, and availability for information security.',
    'Threat actors include insiders, cybercriminal groups, and competitors looking for system access.',
    'Common malware symptoms include crashes, slowdown, unusual CPU usage, and unexpected pop-ups.',
    'Denial-of-service attacks aim to overwhelm a service until legitimate users cannot reach it.',
    'Blended attacks combine multiple techniques to spread faster or hide the original entry point.',
  ].join('\n')
  const input = buildCleanModuleOverviewInput({
    module: {
      id: 'module-1',
      title: 'IT Security',
      summary: null,
      concepts: [],
      recommended_order: [],
    } satisfies Pick<Module, 'id' | 'title' | 'summary' | 'concepts' | 'recommended_order'>,
    resources: [{
      id: 'resource-1',
      moduleId: 'module-1',
      courseId: 'course-1',
      canvasModuleId: null,
      canvasItemId: null,
      canvasFileId: null,
      title: '1. Intro-To-IT-Security.pdf',
      resourceType: 'file',
      contentType: 'application/pdf',
      extension: 'pdf',
      sourceUrl: null,
      htmlUrl: null,
      extractionStatus: 'completed',
      extractedText: repeatedText,
      extractedTextPreview: repeatedText.slice(0, 420),
      extractedCharCount: repeatedText.length,
      extractionError: null,
      required: true,
      metadata: { normalizedSourceType: 'pdf' },
      created_at: new Date().toISOString(),
    } satisfies ModuleResource],
    resourceSummaries: new Map(),
  })

  assert.equal(input.enoughCleanMaterial, true)
  assert.ok(input.cleanMaterialCharCount >= 260)
})
