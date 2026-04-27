import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLearnExperience, resolveLearnResourceSelection } from '../lib/module-workspace'
import type { Module, ModuleResource } from '../lib/types'

test('resolveLearnResourceSelection prefers canonical stored resource ids when they are already available', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * Lecture Notes (Page) [required]',
  ].join('\n'))
  const storedResource = createStoredResource({
    id: 'stored-resource-1',
    title: 'Lecture Notes',
    resourceType: 'Page',
    required: true,
    metadata: {
      canvasModuleName: 'Week 1',
    },
  })

  const experience = buildLearnExperience(moduleRow, {
    resources: [storedResource],
  })

  const selection = resolveLearnResourceSelection(experience, [storedResource], 'stored-resource-1')

  assert.ok(selection)
  assert.equal(selection?.resource.id, 'stored-resource-1')
  assert.equal(selection?.canonicalResourceId, 'stored-resource-1')
  assert.equal(selection?.matchedBy, 'resource_id')
})

test('resolveLearnResourceSelection can map a rendered detail-page resource to the canonical stored resource id', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 2',
    '  * Case Brief (Page) [required]',
  ].join('\n'))
  const storedResource = createStoredResource({
    id: 'stored-resource-1',
    title: 'Case Brief',
    resourceType: 'Page',
    required: true,
    metadata: {
      canvasModuleName: 'Week 1',
    },
  })

  const experience = buildLearnExperience(moduleRow, {
    resources: [storedResource],
  })
  const parsedDetailResource = experience.resources.find((resource) => resource.id !== storedResource.id)

  assert.ok(parsedDetailResource)

  const selection = resolveLearnResourceSelection(experience, [storedResource], parsedDetailResource.id)

  assert.ok(selection)
  assert.equal(selection?.resource.id, parsedDetailResource.id)
  assert.equal(selection?.storedResource?.id, 'stored-resource-1')
  assert.equal(selection?.canonicalResourceId, 'stored-resource-1')
  assert.equal(selection?.matchedBy, 'parsed_title_type_match')
})

test('resolveLearnResourceSelection only leaves the lookup unresolved when the rendered resource truly has no stored row', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 3',
    '  * Supplemental Guide (Page)',
  ].join('\n'))

  const experience = buildLearnExperience(moduleRow)
  const parsedDetailResource = experience.resources[0]

  assert.ok(parsedDetailResource)

  const selection = resolveLearnResourceSelection(experience, [], parsedDetailResource.id)

  assert.ok(selection)
  assert.equal(selection?.resource.id, parsedDetailResource.id)
  assert.equal(selection?.storedResource, null)
  assert.equal(selection?.canonicalResourceId, null)
  assert.equal(selection?.matchedBy, 'no_stored_match')
})

test('resolveLearnResourceSelection keeps multiple resources isolated by stored id and title/type match', () => {
  const moduleRow = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 4',
    '  * Lecture Slides (File) [required]',
    '  * Practice Prompt (Page)',
  ].join('\n'))
  const slides = createStoredResource({
    id: 'slides-resource',
    title: 'Lecture Slides',
    resourceType: 'File',
    required: true,
    metadata: { canvasModuleName: 'Week 4' },
  })
  const prompt = createStoredResource({
    id: 'prompt-resource',
    title: 'Practice Prompt',
    resourceType: 'Page',
    required: false,
    metadata: { canvasModuleName: 'Week 3' },
  })

  const experience = buildLearnExperience(moduleRow, {
    resources: [slides, prompt],
  })

  assert.equal(
    resolveLearnResourceSelection(experience, [slides, prompt], 'slides-resource')?.canonicalResourceId,
    'slides-resource',
  )
  assert.equal(
    resolveLearnResourceSelection(experience, [slides, prompt], 'prompt-resource')?.canonicalResourceId,
    'prompt-resource',
  )

  const parsedPrompt = experience.resources.find((resource) => resource.id !== prompt.id && resource.title === 'Practice Prompt')
  assert.ok(parsedPrompt)
  assert.equal(
    resolveLearnResourceSelection(experience, [slides, prompt], parsedPrompt.id)?.canonicalResourceId,
    'prompt-resource',
  )
})

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
    created_at: '2026-04-13T00:00:00.000Z',
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
    title: overrides.title ?? 'Lecture Notes',
    resourceType: overrides.resourceType ?? 'Page',
    contentType: overrides.contentType ?? 'text/html',
    extension: overrides.extension ?? null,
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/api/v1/courses/1/pages/lecture-notes',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/courses/1/pages/lecture-notes',
    extractionStatus: overrides.extractionStatus ?? 'extracted',
    extractedText: overrides.extractedText ?? 'Read the page and preserve the official terms.',
    extractedTextPreview: overrides.extractedTextPreview ?? 'Read the page and preserve the official terms.',
    extractedCharCount: overrides.extractedCharCount ?? 47,
    extractionError: overrides.extractionError ?? null,
    required: overrides.required ?? false,
    metadata: overrides.metadata ?? {
      canvasModuleName: 'Week 1',
    },
    created_at: overrides.created_at ?? '2026-04-13T00:00:00.000Z',
  }
}
