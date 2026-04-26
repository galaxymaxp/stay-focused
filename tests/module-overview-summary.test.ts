import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildCleanModuleOverviewInput,
  buildModuleOverviewFallback,
  cleanStudyTextForOverview,
  type ResourceSummaryRow,
} from '../lib/source-summaries'
import type { Module, ModuleResource } from '../lib/types'

test('module overview cleaner removes Canvas inbox, messenger, admin, and assignment prompt text', () => {
  const cleaned = cleanStudyTextForOverview([
    'Canvas inbox and Facebook Messenger will be used for consultation.',
    'Credit Hours: 3. Prerequisites: CC13. Prepared by Instructor.',
    'As a group, analyze situational cases and submit the answer before the deadline.',
    'Web applications use client-side and server-side components to deliver interactive services through the browser.',
    'HTML structures page content with semantic elements that help organize headings, paragraphs, forms, and navigation.',
  ].join('\n'))

  assert.equal(/Canvas inbox|Facebook Messenger|Credit Hours|Prerequisites|Prepared by|As a group|submit|deadline/i.test(cleaned), false)
  assert.match(cleaned, /Web applications use client-side/)
  assert.match(cleaned, /HTML structures page content/)
})

test('assignment prompt does not become module overview material', () => {
  const input = buildCleanModuleOverviewInput({
    module: moduleRecord('Ethics activity'),
    resources: [
      resourceRecord({
        title: 'Situational Case Analysis',
        resourceType: 'assignment',
        extractedText: 'As a group, analyze situational cases. Answer the following and submit your work on 1 whole sheet of paper before the deadline.',
      }),
    ],
    resourceSummaries: new Map(),
  })

  assert.equal(input.enoughCleanMaterial, false)
  assert.equal(input.assignmentOnly, true)
  assert.deepEqual(input.sourceLines, [])
})

test('slide intro header does not dominate clean module input', () => {
  const input = buildCleanModuleOverviewInput({
    module: moduleRecord('HTML fundamentals'),
    resources: [
      resourceRecord({
        title: 'Course Introduction and Orientation',
        extractedText: [
          'Slide: Course Introduction and Orientation CC14',
          'Prepared by: Instructor Name',
          'HTML defines the structure of web pages using elements, attributes, headings, paragraphs, links, images, tables, and forms.',
          'CSS complements HTML by controlling layout, spacing, typography, colors, and responsive presentation across device sizes.',
          'A browser parses HTML documents into a document object model that scripts and styles can use to create interactive pages.',
        ].join('\n'),
      }),
    ],
    resourceSummaries: new Map(),
  })

  assert.equal(input.sourceLines.some((line) => /Slide:|Prepared by|Course Introduction and Orientation CC14/i.test(line)), false)
  assert.equal(input.enoughCleanMaterial, true)
})

test('cached resource summaries are preferred for module summary input', () => {
  const resource = resourceRecord({
    id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
    title: 'ENSA_Module_11.pptx',
    extractedText: 'Raw slide text that should not matter much when a cached summary exists.',
  })
  const summaries = new Map<string, ResourceSummaryRow>([
    [resource.id, {
      resourceId: resource.id,
      userId: 'user-1',
      summary: 'This source explains OSPF neighbor relationships, route propagation, and verification commands for enterprise networks.',
      topics: ['OSPF', 'routing', 'verification'],
      studyValue: 'high',
      suggestedUse: 'read first',
      status: 'ready',
      model: 'test',
      sourceHash: 'hash',
      error: null,
      generatedAt: new Date().toISOString(),
    }],
  ])

  const input = buildCleanModuleOverviewInput({
    module: moduleRecord('OSPF routing'),
    resources: [resource],
    resourceSummaries: summaries,
  })

  assert.equal(input.enoughCleanMaterial, true)
  assert.match(input.sourceLines.join('\n'), /OSPF neighbor relationships/)
  assert.match(input.sourceLines.join('\n'), /Suggested use: read first/)
})

test('fallback is honest when only noisy text exists', () => {
  const fallback = buildModuleOverviewFallback({
    readyCount: 0,
    needsActionCount: 2,
    summary: {
      moduleId: 'module-1',
      userId: 'user-1',
      summary: null,
      topics: [],
      suggestedOrder: [],
      warnings: ['Only task instructions were found.'],
      status: 'failed',
      model: null,
      sourceHash: 'hash',
      error: 'Not enough clean study material yet. This module currently contains task instructions, but no readable study source has been processed.',
      generatedAt: null,
    },
  })

  assert.equal(fallback, 'Not enough clean study material yet. This module currently contains task instructions, but no readable study source has been processed.')
})

test('sync action imports summary generation but normal Learn render does not trigger generation', () => {
  const canvasAction = readFileSync('actions/canvas.ts', 'utf8')
  const learnPage = readFileSync('app/modules/[id]/learn/page.tsx', 'utf8')
  const courseSummary = readFileSync('lib/course-page-summary.ts', 'utf8')

  assert.match(canvasAction, /generateSummariesForSyncedModule/)
  assert.match(canvasAction, /generateCoursePageSummaryForUserId/)
  assert.doesNotMatch(learnPage, /summarizeModuleForUser|generateSummariesForSyncedModule/)
  assert.doesNotMatch(courseSummary, /return generateCourseSummary/)
})

test('summary RLS migration enforces auth uid and course ownership checks', () => {
  const sql = readFileSync('supabase/migrations/20260427030000_repair_summary_rls_policies.sql', 'utf8')

  assert.match(sql, /auth\.uid\(\) = user_id/)
  assert.match(sql, /join public\.courses c/)
  assert.match(sql, /c\.user_id = auth\.uid\(\)/)
  assert.match(sql, /notify pgrst, 'reload schema'/)
})

function moduleRecord(title: string): Module {
  return {
    id: 'module-1',
    courseId: 'course-1',
    title,
    raw_content: '',
    summary: null,
    concepts: [],
    study_prompts: [],
    recommended_order: [],
    status: 'processed',
    created_at: new Date().toISOString(),
  }
}

function resourceRecord(overrides: Partial<ModuleResource>): ModuleResource {
  return {
    id: 'resource-1',
    moduleId: 'module-1',
    courseId: 'course-1',
    canvasModuleId: null,
    canvasItemId: null,
    canvasFileId: null,
    title: 'Study source',
    resourceType: 'file',
    contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx',
    sourceUrl: null,
    htmlUrl: null,
    extractionStatus: 'extracted',
    extractedText: null,
    extractedTextPreview: null,
    extractedCharCount: 0,
    extractionError: null,
    required: false,
    metadata: { normalizedSourceType: 'file' },
    created_at: new Date().toISOString(),
    ...overrides,
  }
}
