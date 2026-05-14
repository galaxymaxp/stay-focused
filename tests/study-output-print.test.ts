import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StudyOutputQuizPackPage } from '../components/StudyOutputQuizPackPage'
import { StudyOutputReviewerPage } from '../components/StudyOutputReviewerPage'
import { StudyOutputTaskOutputPage } from '../components/StudyOutputTaskOutputPage'
import type { StudyOutput } from '../lib/types'

test('reviewer page renders dedicated print metadata and keeps screen controls print-hidden', () => {
  const output = createReviewerOutput()
  const markup = renderToStaticMarkup(createElement(StudyOutputReviewerPage, {
    output,
    courseLabel: 'Civil Procedure',
    moduleTitle: 'Jurisdiction',
  }))

  assert.match(markup, /study-output-print-header/)
  assert.match(markup, /Output:<\/strong> Reviewer/)
  assert.match(markup, /Date:<\/strong> May 9, 2026/)
  assert.match(markup, /reviewer-print-hide study-output-screen-header/)
})

test('quiz page renders print-only answer document without interactive controls in the print scaffold', () => {
  const output = createQuizPackOutput()
  const markup = renderToStaticMarkup(createElement(StudyOutputQuizPackPage, {
    output,
    courseLabel: 'Biology',
    moduleTitle: 'Cells',
  }))

  assert.match(markup, /Printable Quiz/)
  assert.match(markup, /study-output-quiz-print-list/)
  assert.match(markup, /Question 1 - Multiple choice/)
  assert.match(markup, /study-output-print-answer-label\">Answer/)
  assert.match(markup, /Review this concept: Mitochondrion/)
  assert.match(markup, /Source-backed note: &quot;Mitochondria are the main ATP-producing organelles\.&quot;/)
  assert.match(markup, /reviewer-print-hide study-output-screen-header/)
  assert.doesNotMatch(markup, /sourceUnitId|confidence|generationMethod|source-map-mcq/)
  assert.doesNotMatch(markup, />LEARN</)
  assert.doesNotMatch(markup, /Deep Learn Tasks Quiz|Course Learn|WORKING CONTEXT/)
})

test('quiz review mode source keeps answer feedback states and identification reveal available', () => {
  const source = readFileSync('components/StudyOutputQuizPackPage.tsx', 'utf8')

  assert.match(source, /Selected answer/)
  assert.match(source, /Correct answer/)
  assert.match(source, /Incorrect/)
  assert.match(source, /Review cue/)
  assert.match(source, /Source-backed note/)
  assert.match(source, /disabled=\{revealed \|\| \(isChoiceQuestion && !hasInput\)\}/)
})

test('task output page keeps actions screen-only while printable content stays rendered', () => {
  const output = createTaskOutput()
  const markup = renderToStaticMarkup(createElement(StudyOutputTaskOutputPage, {
    output,
    courseLabel: 'English',
    moduleTitle: 'Essay Writing',
  }))

  assert.match(markup, /Output:<\/strong> Activity/)
  assert.match(markup, /reviewer-print-hide study-output-screen-header/)
  assert.match(markup, /task-output-print-document/)
  assert.match(markup, /activity-submission/)
  assert.match(markup, /Names:<\/strong> ______________________________/)
  assert.match(markup, /Section \/ Schedule:<\/strong> ______________________________/)
  assert.match(markup, /task-output-preview-frame/)
  assert.match(markup, /Requirements used/)
  assert.doesNotMatch(markup, />LEARN</)
  assert.doesNotMatch(markup, /Deep Learn Tasks Quiz|Course Learn|Working context|WORKING CONTEXT/)
})

function createReviewerOutput(): StudyOutput {
  return {
    id: 'reviewer-1',
    userId: 'user-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    resourceId: 'resource-1',
    sourceKind: 'deep_learn_note',
    sourceNoteId: 'note-1',
    sourceTaskId: null,
    outputKind: 'reviewer',
    status: 'ready',
    title: 'Civil Procedure Reviewer',
    summary: 'Printable reviewer.',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    generatedAt: '2026-05-09T00:00:00.000Z',
    content: {
      version: 'reviewer-v1',
      sourceNoteId: 'note-1',
      sourceResourceId: 'resource-1',
      title: 'Civil Procedure Reviewer',
      summary: 'Printable reviewer.',
      intro: 'Review court power, venue, and diversity first.',
      highYieldConcepts: [
        {
          cue: 'Subject matter jurisdiction',
          answer: 'The court must have authority over the claim type.',
          importance: 'high',
          support: 'This determines whether the court can hear the case at all.',
        },
      ],
      identificationReview: [
        {
          prompt: 'Authority over the claim type',
          answer: 'Subject matter jurisdiction',
          importance: 'high',
          support: 'Core jurisdiction definition.',
        },
      ],
      quickReviewBlocks: [
        { heading: 'Core doctrines', points: ['Subject matter jurisdiction', 'Venue'] },
      ],
      distinctions: [
        { conceptA: 'Venue', conceptB: 'Jurisdiction', difference: 'Venue selects place while jurisdiction concerns power.', confusionNote: null },
      ],
      likelyQuizTargets: [
        { target: 'Complete diversity', reason: 'A common exam trigger.', importance: 'high' },
      ],
      cautionNotes: ['Do not confuse venue defects with lack of jurisdiction.'],
    },
  }
}

function createQuizPackOutput(): StudyOutput {
  return {
    id: 'quiz-1',
    userId: 'user-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    resourceId: 'resource-1',
    sourceKind: 'deep_learn_note',
    sourceNoteId: 'note-1',
    sourceTaskId: null,
    outputKind: 'quiz_pack',
    status: 'ready',
    title: 'Cells Quiz Pack',
    summary: 'Grounded quiz questions for quick review.',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    generatedAt: '2026-05-09T00:00:00.000Z',
    content: {
      version: 'quiz-pack-v1',
      sourceNoteId: 'note-1',
      sourceResourceId: 'resource-1',
      title: 'Cells Quiz Pack',
      summary: 'Grounded quiz questions for quick review.',
      intro: 'Use this to rehearse the most likely recall questions.',
      answerRevealLabel: 'Reveal answer',
      selfReviewLabel: 'Mark correct',
      questionCountOptions: [3, 5],
      items: [
        {
          id: 'q1',
          type: 'multiple_choice',
          prompt: 'Which organelle produces ATP for the cell?',
          answer: 'Mitochondrion',
          explanation: 'Mitochondria are the main ATP-producing organelles.',
          sourceWording: 'Mitochondria are the main ATP-producing organelles.',
          sourceBasis: 'Mitochondria are the main ATP-producing organelles.',
          choices: ['Mitochondrion', 'Ribosome', 'Golgi apparatus'],
          sourceLabel: 'Cell biology notes',
          sourceUnitId: 'mitochondrion',
          confidence: 0.91,
          generationMethod: 'source_map_mcq',
          matchingPrompt: null,
        },
        {
          id: 'q2',
          type: 'identification',
          prompt: 'Site of protein synthesis',
          answer: 'Ribosome',
          explanation: 'Ribosomes assemble proteins from mRNA instructions.',
          choices: [],
          sourceLabel: 'Cell biology notes',
          matchingPrompt: null,
        },
      ],
    },
  }
}

function createTaskOutput(): StudyOutput {
  return {
    id: 'task-output-1',
    userId: 'user-1',
    courseId: 'course-1',
    moduleId: 'module-1',
    resourceId: null,
    sourceKind: 'task',
    sourceNoteId: null,
    sourceTaskId: 'task-1',
    outputKind: 'task_output',
    status: 'ready',
    title: 'Essay Draft Output',
    summary: 'Grounded task output.',
    createdAt: '2026-05-09T00:00:00.000Z',
    updatedAt: '2026-05-09T00:00:00.000Z',
    generatedAt: '2026-05-09T00:00:00.000Z',
    content: {
      version: 'task-output-v1',
      sourceTaskId: 'task-1',
      taskTitle: 'Essay Draft',
      preset: 'report',
      outputType: 'pdf',
      previewMode: 'html',
      title: 'Essay Draft Output',
      summary: 'Grounded task output.',
      previewContent: '<main><h1>Essay</h1><p>Grounded preview.</p></main>',
      stylesheet: null,
      script: null,
      requirementSummary: 'Use the task instructions.',
      requirements: ['Address the prompt directly'],
      selectedContext: ['Use the assigned reading as evidence.'],
      groundingStatus: 'grounded',
      groundingNote: 'Built only from readable task and source text.',
      limitationNote: null,
      warnings: [],
      exports: [
        {
          filename: 'essay-draft-output.html',
          label: 'Download printable HTML',
          mimeType: 'text/html',
          content: '<!doctype html><html><body><main><h1>Essay</h1><p>Grounded preview.</p></main></body></html>',
        },
      ],
      revisionHistory: [],
    },
  }
}
