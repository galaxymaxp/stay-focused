import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLearnExperience, resolveLearnResourceSelection } from '../lib/module-workspace'
import { normalizeSourceReadiness } from '../lib/source-readiness'
import type { Module, ModuleResource } from '../lib/types'

function createModule(rawContent: string): Module {
  return {
    id: 'module-1',
    courseId: 'course-1',
    title: 'Week 1',
    raw_content: rawContent,
    summary: null,
    concepts: [],
    study_prompts: [],
    recommended_order: [],
    status: 'processed',
    created_at: '2026-04-09T00:00:00.000Z',
  }
}

function createStoredResource(overrides: Partial<ModuleResource> = {}): ModuleResource {
  return {
    id: overrides.id ?? 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasModuleId: overrides.canvasModuleId ?? 101,
    canvasItemId: overrides.canvasItemId ?? 201,
    canvasFileId: overrides.canvasFileId ?? null,
    title: overrides.title ?? 'Worksheet 1',
    resourceType: overrides.resourceType ?? 'Page',
    contentType: overrides.contentType ?? 'text/html',
    extension: overrides.extension ?? null,
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/api/v1/courses/1/pages/worksheet-1',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/pages/worksheet-1',
    extractionStatus: overrides.extractionStatus ?? 'extracted',
    extractedText: overrides.extractedText ?? 'Practice the core idea before class.',
    extractedTextPreview: overrides.extractedTextPreview ?? 'Practice the core idea before class.',
    extractedCharCount: overrides.extractedCharCount ?? 38,
    extractionError: overrides.extractionError ?? null,
    required: overrides.required ?? true,
    metadata: overrides.metadata ?? {
      canvasModuleName: 'Week 1',
    },
    created_at: overrides.created_at ?? '2026-04-09T00:00:00.000Z',
  }
}

const strongExtract = [
  'Web development relies on structured HTML documents, clear CSS styling, and careful browser inspection.',
  'Students should connect each file to the module outcomes, identify the main terms, and explain examples in their own words.',
  'The source includes enough readable paragraphs to support study notes, quiz generation, and a reliable review pass.',
  'Use the recovered text as the canonical learning source even when the Canvas module item title differs from the file display name.',
].join(' ')

test('buildLearnExperience does not duplicate a stored resource when extraction changes its Learn kind', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * Worksheet 1 (Page) [required]',
  ].join('\n'))

  const experience = buildLearnExperience(moduleRow, {
    resources: [createStoredResource()],
  })

  assert.equal(experience.resources.length, 1)
  assert.equal(experience.learnUnits.length, 1)
  assert.equal(experience.resources[0]?.title, 'Worksheet 1')
  assert.equal(experience.resources[0]?.id, 'resource-1')
})

test('buildLearnExperience keeps distinct stored resources even when they share the same title and source type', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * Lecture Notes (Page)',
    '  * Lecture Notes (Page)',
  ].join('\n'))

  const experience = buildLearnExperience(moduleRow, {
    resources: [
      createStoredResource({
        id: 'resource-a',
        title: 'Lecture Notes',
        required: false,
        canvasItemId: 301,
        sourceUrl: 'https://canvas.example/api/v1/courses/1/pages/lecture-notes-a',
        htmlUrl: 'https://canvas.example/courses/1/pages/lecture-notes-a',
      }),
      createStoredResource({
        id: 'resource-b',
        title: 'Lecture Notes',
        required: false,
        canvasItemId: 302,
        sourceUrl: 'https://canvas.example/api/v1/courses/1/pages/lecture-notes-b',
        htmlUrl: 'https://canvas.example/courses/1/pages/lecture-notes-b',
      }),
    ],
  })

  assert.deepEqual(
    experience.resources.map((resource) => resource.id),
    ['resource-a', 'resource-b'],
  )
})

test('buildLearnExperience attaches Canvas module item display titles to extracted resources by stable Canvas IDs', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * 1.2 - Intro to Web Development and Intermediate HTML.pdf (File) [required] <!-- canvasModuleId=407362 canvasModuleItemId=2485610 canvasItemId=2485610 canvasFileId=10459869 contentId=10459869 -->',
    '  * 1.3 - Intro to CSS.pdf (File) [required] <!-- canvasModuleId=407362 canvasModuleItemId=2485611 canvasItemId=2485611 canvasFileId=10459870 contentId=10459870 -->',
    '  * 2. Git.pptx (File) [required] <!-- canvasModuleId=407362 canvasModuleItemId=2485612 canvasItemId=2485612 canvasFileId=10459871 contentId=10459871 -->',
    '  * 7.1 DOM.pptx (File) [required] <!-- canvasModuleId=407362 canvasModuleItemId=2485613 canvasItemId=2485613 canvasFileId=10459872 contentId=10459872 -->',
  ].join('\n'))

  const storedResources = [
    createStoredResource({
      id: 'web-dev',
      title: '2. Intro to Web Development and Intermediate HTML.pdf',
      canvasModuleId: 407362,
      canvasItemId: 2485610,
      canvasFileId: 10459869,
      extractedText: strongExtract,
      extractedTextPreview: strongExtract.slice(0, 180),
      extractedCharCount: 5398,
      sourceUrl: 'https://canvas.example/files/10459869/download',
      htmlUrl: 'https://canvas.example/files/10459869',
      metadata: { canvasModuleName: 'Week 1', canvasModuleItemId: 2485610, canvasFileId: 10459869, contentId: 10459869 },
    }),
    createStoredResource({
      id: 'css',
      title: '3. Intro to CSS.pdf',
      canvasModuleId: 407362,
      canvasItemId: 2485611,
      canvasFileId: 10459870,
      extractedText: strongExtract,
      extractedTextPreview: strongExtract.slice(0, 180),
      extractedCharCount: 2000,
      metadata: { canvasModuleName: 'Week 1', canvasModuleItemId: 2485611, canvasFileId: 10459870, contentId: 10459870 },
    }),
    createStoredResource({
      id: 'git',
      title: '4. Git.pptx',
      canvasModuleId: 407362,
      canvasItemId: 2485612,
      canvasFileId: 10459871,
      resourceType: 'File',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
      extractedText: strongExtract,
      extractedTextPreview: strongExtract.slice(0, 180),
      extractedCharCount: 2100,
      metadata: { canvasModuleName: 'Week 1', canvasModuleItemId: 2485612, canvasFileId: 10459871, contentId: 10459871 },
    }),
    createStoredResource({
      id: 'dom',
      title: '7.3 DOM.pptx',
      canvasModuleId: 407362,
      canvasItemId: 2485613,
      canvasFileId: 10459872,
      resourceType: 'File',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
      extractedText: strongExtract,
      extractedTextPreview: strongExtract.slice(0, 180),
      extractedCharCount: 2200,
      metadata: { canvasModuleName: 'Week 1', canvasModuleItemId: 2485613, canvasFileId: 10459872, contentId: 10459872 },
    }),
  ]

  const experience = buildLearnExperience(moduleRow, { resources: storedResources })
  assert.equal(experience.resources.length, 4)
  assert.deepEqual(
    experience.resources.map((resource) => resource.title),
    [
      '1.2 - Intro to Web Development and Intermediate HTML.pdf',
      '1.3 - Intro to CSS.pdf',
      '2. Git.pptx',
      '7.1 DOM.pptx',
    ],
  )

  for (const resource of experience.resources) {
    const selection = resolveLearnResourceSelection(experience, storedResources, resource.id)
    assert.equal(selection?.storedResource?.extractionStatus, 'extracted')
    assert.equal(selection?.canonicalResourceId, resource.id)
    const sourceReadiness = normalizeSourceReadiness({
      resource,
      storedResource: selection?.storedResource ?? null,
      canonicalResourceId: selection?.canonicalResourceId ?? null,
      moduleId: moduleRow.id,
      moduleTitle: moduleRow.title,
    })
    assert.equal(sourceReadiness.state, 'ready')
    assert.equal(sourceReadiness.statusLabel, 'Ready')
  }
})

test('buildLearnExperience keeps title fallback conservative when stable Canvas IDs are absent', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * 1.2 - Intro to Web Development and Intermediate HTML.pdf (File) [required]',
  ].join('\n'))

  const experience = buildLearnExperience(moduleRow, {
    resources: [
      createStoredResource({
        id: 'web-dev',
        title: '2. Intro to Web Development and Intermediate HTML.pdf',
        canvasItemId: null,
        canvasFileId: null,
      }),
    ],
  })

  assert.equal(experience.resources.length, 2)
  assert.deepEqual(
    experience.resources.map((resource) => resource.title),
    [
      '2. Intro to Web Development and Intermediate HTML.pdf',
      '1.2 - Intro to Web Development and Intermediate HTML.pdf',
    ],
  )
})

test('buildLearnExperience can bridge legacy parsed module rows by stable stored Canvas order', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * 1.2 - Intro to Web Development and Intermediate HTML.pdf (File) [required]',
    '  * 1.3 - Intro to CSS.pdf (File) [required]',
    '  * 2. Git.pptx (File) [required]',
    '  * 7.1 DOM.pptx (File) [required]',
  ].join('\n'))

  const storedResources = [
    createStoredResource({
      id: 'web-dev',
      title: '2. Intro to Web Development and Intermediate HTML.pdf',
      resourceType: 'File',
      contentType: 'application/pdf',
      extension: 'pdf',
      canvasItemId: 2485610,
      canvasFileId: 10459869,
      extractedText: strongExtract,
      extractedCharCount: 5398,
      metadata: { canvasModuleName: 'Week 1' },
    }),
    createStoredResource({
      id: 'css',
      title: '3. Intro to CSS.pdf',
      resourceType: 'File',
      contentType: 'application/pdf',
      extension: 'pdf',
      canvasItemId: 2485611,
      canvasFileId: 10459870,
      extractedText: strongExtract,
      extractedCharCount: 2000,
      metadata: { canvasModuleName: 'Week 1' },
    }),
    createStoredResource({
      id: 'git',
      title: '4. Git.pptx',
      resourceType: 'File',
      canvasItemId: 2485612,
      canvasFileId: 10459871,
      extension: 'pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extractedText: strongExtract,
      extractedCharCount: 2100,
      metadata: { canvasModuleName: 'Week 1' },
    }),
    createStoredResource({
      id: 'dom',
      title: '7.3 DOM.pptx',
      resourceType: 'File',
      canvasItemId: 2485613,
      canvasFileId: 10459872,
      extension: 'pptx',
      contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extractedText: strongExtract,
      extractedCharCount: 2200,
      metadata: { canvasModuleName: 'Week 1' },
    }),
  ]

  const experience = buildLearnExperience(moduleRow, { resources: storedResources })

  assert.equal(experience.resources.length, 4)
  assert.deepEqual(
    experience.resources.map((resource) => [resource.id, resource.title, resource.extractionStatus]),
    [
      ['web-dev', '1.2 - Intro to Web Development and Intermediate HTML.pdf', 'extracted'],
      ['css', '1.3 - Intro to CSS.pdf', 'extracted'],
      ['git', '2. Git.pptx', 'extracted'],
      ['dom', '7.1 DOM.pptx', 'extracted'],
    ],
  )
})
