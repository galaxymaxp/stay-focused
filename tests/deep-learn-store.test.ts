import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCourseLearnOverview } from '../lib/course-learn-overview'
import { getDeepLearnNoteForResource, listDeepLearnNotesForModule } from '../lib/deep-learn-store'
import type { ClarityWorkspace } from '../lib/clarity-workspace'
import type { ModuleWorkspaceData } from '../lib/module-workspace'
import type { Course, Module } from '../lib/types'

test('listDeepLearnNotesForModule returns mapped packs when the query succeeds', async () => {
  const result = await listDeepLearnNotesForModule('module-1', {
    isAuthConfigured: true,
    getAuthContext: async () => createAuthContext(),
    executeListModuleQuery: async () => ({
      data: [createDeepLearnNoteRow()],
      error: null,
    }),
  })

  assert.equal(result.availability, 'available')
  assert.equal(result.reason, 'ok')
  assert.equal(result.notes.length, 1)
  assert.equal(result.notes[0]?.resourceId, 'resource-1')
  assert.equal(result.notes[0]?.title, 'Exam Prep Pack')
})

test('listDeepLearnNotesForModule treats an empty result as available with no packs', async () => {
  const result = await listDeepLearnNotesForModule('module-1', {
    isAuthConfigured: true,
    getAuthContext: async () => createAuthContext(),
    executeListModuleQuery: async () => ({
      data: [],
      error: null,
    }),
  })

  assert.equal(result.availability, 'available')
  assert.equal(result.reason, 'ok')
  assert.equal(result.notes.length, 0)
})

test('listDeepLearnNotesForModule degrades gracefully when the deep_learn_notes table is missing', async () => {
  const result = await listDeepLearnNotesForModule('module-1', {
    isAuthConfigured: true,
    getAuthContext: async () => createAuthContext(),
    executeListModuleQuery: async () => ({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.deep_learn_notes' in the schema cache",
        details: null,
        hint: "Perhaps you meant the table 'public.learning_items'",
      },
    }),
  })

  assert.equal(result.availability, 'unavailable')
  assert.equal(result.reason, 'table_missing')
  assert.equal(result.notes.length, 0)
  assert.match(result.message ?? '', /exam prep packs/i)
})

test('getDeepLearnNoteForResource returns missing without logging when no pack exists yet', async () => {
  const originalError = console.error
  const logCalls: unknown[][] = []
  console.error = (...args: unknown[]) => {
    logCalls.push(args)
  }

  try {
    const result = await getDeepLearnNoteForResource('module-1', 'resource-1', {
      isAuthConfigured: true,
      getAuthContext: async () => createAuthContext(),
      executeResourceNoteQuery: async () => ({
        data: null,
        error: null,
      }),
    })

    assert.equal(result.availability, 'available')
    assert.equal(result.reason, 'missing')
    assert.equal(result.note, null)
    assert.equal(result.message, null)
    assert.equal(logCalls.length, 0)
  } finally {
    console.error = originalError
  }
})

test('getDeepLearnNoteForResource treats no-row query errors as missing instead of load failures', async () => {
  const originalError = console.error
  const logCalls: unknown[][] = []
  console.error = (...args: unknown[]) => {
    logCalls.push(args)
  }

  try {
    const result = await getDeepLearnNoteForResource('module-1', 'resource-1', {
      isAuthConfigured: true,
      getAuthContext: async () => createAuthContext(),
      executeResourceNoteQuery: async () => ({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
          details: 'Results contain 0 rows, application/vnd.pgrst.object+json requires 1 row',
          hint: null,
        },
      }),
    })

    assert.equal(result.availability, 'available')
    assert.equal(result.reason, 'missing')
    assert.equal(result.note, null)
    assert.equal(logCalls.length, 0)
  } finally {
    console.error = originalError
  }
})

test('course learn overview still builds when exam prep pack listing is unavailable', async () => {
  const course = createCourse()
  const moduleRecord = createModule(course.id)
  const workspace = createClarityWorkspace(course, moduleRecord)
  const moduleWorkspace = createModuleWorkspace(moduleRecord)

  const overview = await buildCourseLearnOverview(workspace, course.id, {
    getModuleWorkspace: async () => moduleWorkspace,
    listDeepLearnNotesForModule: async () => ({
      notes: [],
      availability: 'unavailable',
      reason: 'table_missing',
      message: 'Saved Deep Learn exam prep packs are unavailable because the deep_learn_notes table is missing in this environment.',
      userId: 'user-1',
    }),
  })

  assert.ok(overview)
  assert.equal(overview?.deepLearnUnavailableModuleCount, 1)
  assert.equal(overview?.modules[0]?.deepLearnNotesAvailability, 'unavailable')
  assert.match(overview?.modules[0]?.deepLearnNotesMessage ?? '', /deep_learn_notes table/i)
})

function createAuthContext() {
  return {
    client: {} as never,
    user: { id: 'user-1' } as never,
  }
}

function createDeepLearnNoteRow() {
  return {
    id: 'note-1',
    user_id: 'user-1',
    module_id: 'module-1',
    course_id: 'course-1',
    resource_id: 'resource-1',
    status: 'ready',
    title: 'Exam Prep Pack',
    overview: 'Overview',
    sections: [],
    note_body: '',
    core_terms: [],
    key_facts: [],
    distinctions: [],
    likely_quiz_points: [],
    caution_notes: [],
    source_grounding: {
      sourceType: 'PDF',
      extractionQuality: 'usable',
      groundingStrategy: 'stored_extract',
      usedAiFallback: false,
      qualityReason: null,
      warning: null,
      charCount: 1000,
    },
    quiz_ready: false,
    prompt_version: 'v2-exam-prep',
    error_message: null,
    created_at: '2026-04-13T00:00:00.000Z',
    updated_at: '2026-04-13T00:00:00.000Z',
    generated_at: '2026-04-13T00:00:00.000Z',
  }
}

function createCourse(): Course {
  return {
    id: 'course-1',
    code: 'LAW101',
    name: 'Intro to Law',
    term: '2026',
    instructor: 'Instructor',
    focusLabel: 'Focus',
    colorToken: 'blue',
  }
}

function createModule(courseId: string): Module {
  return {
    id: 'module-1',
    courseId,
    title: 'Module 1',
    raw_content: 'Course: Intro to Law\nModule focus: negligence basics',
    summary: 'Overview',
    recommended_order: null,
    status: 'processed',
    created_at: '2026-04-13T00:00:00.000Z',
    showInLearn: true,
  }
}

function createClarityWorkspace(course: Course, module: Module): ClarityWorkspace {
  return {
    hasSyncedData: true,
    courses: [course],
    modules: [module],
    learnItems: [],
    taskItems: [],
    todayItems: [],
    calendarItems: [],
    freshestModule: module,
    freshestModuleCourse: course,
    recentAnnouncements: [],
    today: {
      nextBestMove: null,
      needsAction: [],
      needsUnderstanding: [],
      comingUp: [],
      undatedTaskCount: 0,
    },
  }
}

function createModuleWorkspace(module: Module): ModuleWorkspaceData {
  return {
    module,
    tasks: [],
    deadlines: [],
    resources: [],
    resourceStudyStates: [],
    terms: [],
    courseInstructor: null,
  }
}
