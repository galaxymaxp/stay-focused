import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLearnExperience } from '../lib/module-workspace'
import type { Module, ModuleResource } from '../lib/types'

function createModule(rawContent: string): Module {
  return {
    id: 'module-1',
    courseId: 'course-1',
    title: 'HTML Basics',
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
    canvasFileId: overrides.canvasFileId ?? 301,
    title: overrides.title ?? '1. Introduction to HTML.pdf',
    resourceType: overrides.resourceType ?? 'File',
    contentType: overrides.contentType ?? 'application/pdf',
    extension: overrides.extension ?? 'pdf',
    sourceUrl: overrides.sourceUrl ?? 'https://canvas.example/files/301/download',
    htmlUrl: overrides.htmlUrl ?? 'https://canvas.example/files/301',
    extractionStatus: overrides.extractionStatus ?? 'extracted',
    extractedText: overrides.extractedText ?? 'HTML introduces the structure of a webpage.',
    extractedTextPreview: overrides.extractedTextPreview ?? 'HTML introduces the structure of a webpage.',
    extractedCharCount: overrides.extractedCharCount ?? 45,
    extractionError: overrides.extractionError ?? null,
    required: overrides.required ?? true,
    metadata: overrides.metadata ?? {
      canvasModuleName: 'Week 1',
    },
    created_at: overrides.created_at ?? '2026-04-09T00:00:00.000Z',
  }
}

test('buildLearnExperience merges a fallback file row into the richer stored file when numbering punctuation differs', () => {
  const module = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * 1.0 - Introduction to HTML.pdf (File) [required]',
  ].join('\n'))

  const experience = buildLearnExperience(module, {
    resources: [
      createStoredResource({
        title: '1. Introduction to HTML.pdf',
      }),
    ],
  })

  assert.equal(experience.resources.length, 1)
  assert.equal(experience.learnUnits.length, 1)
  assert.equal(experience.resources[0]?.title, '1. Introduction to HTML.pdf')
  assert.equal(experience.resources[0]?.extractionStatus, 'extracted')
})

test('buildLearnExperience does not merge distinct numbered file resources when the numbering prefix changes meaningfully', () => {
  const module = createModule([
    'Course: Test Course (TC101)',
    '',
    'MODULES:',
    '- Week 1',
    '  * 2.0 - Introduction to HTML.pdf (File) [required]',
  ].join('\n'))

  const experience = buildLearnExperience(module, {
    resources: [
      createStoredResource({
        title: '1. Introduction to HTML.pdf',
      }),
    ],
  })

  assert.equal(experience.resources.length, 2)
  assert.deepEqual(
    experience.resources.map((resource) => resource.title),
    ['1. Introduction to HTML.pdf', '2.0 - Introduction to HTML.pdf'],
  )
})
