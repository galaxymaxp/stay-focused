import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLearnExperience } from '../lib/module-workspace'
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
