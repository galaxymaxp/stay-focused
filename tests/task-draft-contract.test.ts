import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTaskDraftFallback,
  buildTaskDraftRequestPayload,
  buildTaskDraftUserPrompt,
  isTaskDraftApiResponse,
  parseTaskDraftResponseText,
} from '../lib/do-now'

test('task draft contract stays deliverable-first and grounded in surfaced requirements', () => {
  const context = {
    taskTitle: 'Learning Contract',
    taskDetails: 'Write one handwritten learning contract on one whole yellow sheet of paper.',
    deadline: '2026-04-07',
    priority: 'high' as const,
    courseName: 'Foundations of Learning',
    moduleTitle: 'Week 1 Orientation',
    resourceSnippet: [
      'Write one handwritten learning contract on one whole yellow sheet of paper.',
      'Include the following sections: Expectations, Contributions, Motivations, Hindrances.',
      'Write five entries per section.',
    ].join('\n'),
  }

  const payload = buildTaskDraftRequestPayload(context)

  assert.equal(payload.title, 'Learning Contract')
  assert.equal(payload.type, 'Assignment')
  assert.ok(payload.sourceKey.startsWith('task:'))
  assert.ok(payload.instructions.includes('one whole yellow sheet of paper'))
  assert.ok(payload.requirements?.includes('Deliverable: one handwritten learning contract on one whole yellow sheet of paper'))
  assert.ok(payload.requirements?.includes('Required sections: Expectations, Contributions, Motivations, Hindrances'))
  assert.ok(payload.requirements?.includes('Quantity: five entries per section'))
  assert.ok(payload.requirements?.some((entry) => entry.startsWith('Format / material: ')))
  assert.ok(payload.requirements?.includes('Urgency: overdue'))

  const prompt = buildTaskDraftUserPrompt(payload)
  assert.ok(prompt.includes('Use only the following task data in this request.'))
  assert.ok(prompt.includes('Task title: Learning Contract'))
  assert.ok(prompt.includes(`Source key: ${payload.sourceKey}`))
  assert.ok(prompt.includes('Requirements:'))
  assert.ok(prompt.includes('Treat the following task as a real assignment with a concrete deliverable.'))
  assert.ok(prompt.includes('- Ground the response strictly in the following task data.'))
  assert.ok(prompt.includes('- Produce the likely deliverable immediately.'))
  assert.equal(prompt.includes('the task above'), false)

  const fallback = buildTaskDraftFallback(context)
  assert.ok(fallback.requirementSummary.includes('Deliverable: one handwritten learning contract on one whole yellow sheet of paper.'))
  assert.ok(fallback.draftOutput.includes('Expectations'))
  assert.ok(fallback.draftOutput.includes('Motivations'))
  assert.equal(fallback.missingDetails, 'None that block a first draft.')
  assert.ok(fallback.paperAction.includes('Write the heading "Expectations"'))
  assert.ok(fallback.smallestNextStep.includes('Finish the first entry under "Expectations"'))

  const parsed = parseTaskDraftResponseText([
    '0. Requirement summary',
    'Deliverable: one handwritten learning contract. Sections: Expectations, Contributions, Motivations, Hindrances.',
    '',
    '1. Draft output',
    'Learning Contract',
    '',
    'Expectations',
    '1. I expect to stay on schedule.',
    '',
    '2. What is still missing or unclear?',
    'None that block a first draft.',
    '',
    '3. What should I do on the paper right now?',
    'Write the heading "Expectations" and add the first entry under it.',
    '',
    '4. Smallest next step',
    'Finish the first entry under "Expectations", then move to "Contributions".',
  ].join('\n'))

  assert.ok(parsed.requirementSummary.includes('Deliverable: one handwritten learning contract.'))
  assert.equal(parsed.missingDetails, 'None that block a first draft.')
  assert.ok(parsed.paperAction.includes('Write the heading "Expectations"'))
  assert.ok(parsed.smallestNextStep.includes('move to "Contributions"'))

  assert.equal(isTaskDraftApiResponse({
    ok: true,
    draft: parsed,
    cacheStatus: 'hit',
  }), true)
})
