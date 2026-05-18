import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildTaskOutputFallback,
  buildTaskOutputRequest,
  buildTaskOutputUserPrompt,
  detectTaskOutputFormat,
  evaluateTaskOutputReadiness,
  normalizeTaskOutputModelResponse,
} from '../lib/task-output'
import type { StudyOutputTaskOutputContent } from '../lib/types'

test('task output request stays grounded in task instructions and readable selected context', () => {
  const context = {
    taskId: 'task-1',
    taskTitle: 'Water Cycle Report',
    taskDetails: 'Write a two-page report explaining evaporation, condensation, and precipitation.',
    deadline: '2026-05-15',
    priority: 'high' as const,
    courseName: 'Earth Science',
    moduleTitle: 'Weather Systems',
    resourceSnippet: [
      'Evaporation changes liquid water into vapor.',
      'Condensation forms clouds when vapor cools.',
      'Metadata: OCR provider vision-v2',
      'UUID: 123e4567-e89b-12d3-a456-426614174000',
    ].join('\n'),
    sourceText: [
      'Precipitation returns water to the surface as rain, snow, sleet, or hail.',
      'Debug: extracted_char_count=2890',
    ].join('\n'),
    sourceNote: 'Use the class diagram on phase changes to keep the explanation in sequence.',
    moduleSummary: 'Older module summary text should not be used as selected context for task outputs.',
  }

  const request = buildTaskOutputRequest(context, {
    preset: 'report',
    outputType: 'pdf',
  })

  assert.equal(request.preset, 'report')
  assert.equal(request.outputType, 'pdf')
  assert.equal(request.groundingStatus, 'grounded')
  assert.ok(request.instructions.includes('two-page report'))
  assert.ok(request.selectedContext.some((item) => item.includes('Evaporation changes liquid water into vapor.')))
  assert.ok(request.selectedContext.some((item) => item.includes('Precipitation returns water to the surface')))
  assert.equal(request.selectedContext.some((item) => /Metadata:|UUID:|Debug:/i.test(item)), false)
  assert.equal(request.selectedContext.some((item) => item.includes('Older module summary text')), false)

  const prompt = buildTaskOutputUserPrompt(request)
  assert.ok(prompt.includes('Requested preset: report'))
  assert.ok(prompt.includes('Requested output type: pdf'))
  assert.ok(prompt.includes('Detected task format: essay_report'))
  assert.ok(prompt.includes('- No fake citations.'))
  assert.ok(prompt.includes('- No fabricated requirements.'))
})

test('short-answer task output is grounded by actionable prompt and answers directly', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-short',
    taskTitle: 'M1: Application',
    taskDetails: 'Answer in 2-3 sentences: How can regular physical activity help a student manage stress and improve daily performance?',
    deadline: '2026-05-20',
    priority: 'high',
    courseName: 'PATHFit 3',
    moduleTitle: 'M1',
    resourceSnippet: [
      'Regular physical activity supports cardiovascular endurance and helps reduce stress through consistent movement.',
      'The module emphasizes setting realistic exercise goals and connecting activity to daily wellness habits.',
    ].join('\n'),
    sourceText: 'The rubric gives points for directly answering the prompt, using module concepts, and staying within 2-3 sentences.',
    sourceNote: null,
    moduleSummary: 'Old course summary should not be needed.',
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  assert.equal(request.groundingStatus, 'grounded')
  assert.equal(request.detectedFormat, 'short_answer')

  const fallback = buildTaskOutputFallback(request)
  assert.equal(fallback.groundingStatus, 'grounded')
  assert.doesNotMatch(fallback.previewContent, /Purpose|Deliverable focus|Grounded context|Next edit pass/)
  assert.match(fallback.previewContent, /physical activity|stress/i)
  assert.ok(fallback.previewContent.split(/(?<=[.!?])\s+/).length <= 3)

  const htmlExport = fallback.exports.find((file) => file.filename.endsWith('.html'))
  assert.ok(htmlExport)
  assert.match(htmlExport.content, /activity-submission/)
  assert.match(htmlExport.content, /<strong>Names:<\/strong> ______________________________/)
  assert.match(htmlExport.content, /<strong>Section \/ Schedule:<\/strong> ______________________________/)
  assert.match(htmlExport.content, /PATHFit 3/)
  assert.match(htmlExport.content, /M1: Application/)
  assert.doesNotMatch(htmlExport.content, /<pre>/)
})

test('task output format detection covers common assignment shapes', () => {
  assert.equal(detectTaskOutputFormat({
    title: 'Reflection Journal',
    instructions: 'Reflect on your experience after the activity.',
  }), 'reflection')
  assert.equal(detectTaskOutputFormat({
    title: 'Module Quiz',
    instructions: 'Answer the multiple choice and identification items.',
  }), 'quiz_like')
  assert.equal(detectTaskOutputFormat({
    title: 'Activity Sheet',
    instructions: 'Complete the worksheet table.',
  }), 'activity_sheet')
})

test('placeholder-heavy task output is saved as outline only instead of ready', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-template',
    taskTitle: 'Security Threat Report',
    taskDetails: 'Investigate and analyze the top 10 most infamous malware, viruses, and security threats from the past decade.',
    deadline: '2026-05-20',
    priority: 'high',
    courseName: 'Security',
    moduleTitle: 'Threats',
    resourceSnippet: 'The assignment asks for an investigation report with analysis and sources.',
    sourceText: null,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  const output = normalizeTaskOutputModelResponse({
    title: 'Security Threat Report',
    summary: 'Report template.',
    previewMode: 'rich_text',
    previewContent: [
      'Introduction',
      '',
      'Background: ______________________________',
      'Threat 1: ______________________________',
      'Threat 2: ______________________________',
      'Analysis: Fill in this section with research.',
      'Recommendations: Replace placeholders with your findings.',
      'References',
      '',
      'Add real evidence here.',
    ].join('\n'),
    stylesheet: null,
    script: null,
    groundingNote: 'Grounded in the assignment prompt.',
    limitationNote: null,
    warnings: [],
    requirementsUsed: request.requirements,
    selectedContextUsed: request.selectedContext,
  }, request, null)

  assert.equal(output.readinessStatus, 'needs_research')
  assert.equal(output.readinessLabel, 'Needs research')
})

test('generic blank report template is rejected as ready', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-blank',
    taskTitle: 'Course Report',
    taskDetails: 'Write a report using the course notes.',
    deadline: null,
    priority: 'medium',
    courseName: 'Writing',
    moduleTitle: 'Reports',
    resourceSnippet: 'Use the report format.',
    sourceText: 'The report requires introduction, analysis, conclusion, and references.',
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'pdf',
  })

  const readiness = evaluateTaskOutputReadiness({
    request,
    previewContent: [
      'Introduction',
      'Purpose',
      'Background',
      'Analysis',
      'Conclusion',
      'References',
      'Name: __________________',
      'Date: __________________',
      'Section: __________________',
      'Fill in this section after research.',
      'Replace placeholders before submission.',
    ].join('\n'),
  })

  assert.equal(readiness.ready, false)
  assert.equal(readiness.status, 'draft_outline_only')
})

test('copied assignment instructions alone are not ready', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-copy',
    taskTitle: 'Compare Two Readings',
    taskDetails: 'Compare the two assigned readings from the module. Explain one similarity, one difference, and one takeaway using course evidence.',
    deadline: null,
    priority: 'medium',
    courseName: 'Humanities',
    moduleTitle: 'Readings',
    resourceSnippet: 'The readings discuss civic identity and community responsibility in different historical periods.',
    sourceText: 'Reading A frames civic identity as shared responsibility. Reading B frames civic identity as participation in public decision-making.',
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  const readiness = evaluateTaskOutputReadiness({
    request,
    previewContent: 'Compare the two assigned readings from the module. Explain one similarity, one difference, and one takeaway using course evidence.',
  })

  assert.equal(readiness.ready, false)
  assert.equal(readiness.status, 'draft_outline_only')
  assert.ok(readiness.reasons.includes('copied_assignment_instructions'))
})

test('outline-only output is saved but not marked ready', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-outline',
    taskTitle: 'Policy Analysis',
    taskDetails: 'Analyze the policy using the module framework.',
    deadline: null,
    priority: 'medium',
    courseName: 'Social Science',
    moduleTitle: 'Policy',
    resourceSnippet: 'The module framework asks students to identify the policy goal, stakeholders, tradeoffs, and evidence.',
    sourceText: 'Stakeholder analysis compares who benefits, who carries costs, and what assumptions support the proposal.',
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'pdf',
  })

  const output = normalizeTaskOutputModelResponse({
    title: 'Policy Analysis Draft',
    summary: 'Useful outline.',
    previewMode: 'rich_text',
    previewContent: [
      'Introduction',
      'State the policy goal.',
      '',
      'Stakeholders',
      'Add the main stakeholder groups.',
      '',
      'Analysis',
      'Fill in this section with evidence from the module.',
      '',
      'Conclusion',
      'Replace placeholders with the final claim.',
    ].join('\n'),
    stylesheet: null,
    script: null,
    groundingNote: 'Grounded in task text.',
    limitationNote: null,
    warnings: [],
    requirementsUsed: request.requirements,
    selectedContextUsed: request.selectedContext,
  }, request, null)

  assert.equal(output.version, 'task-output-v1')
  assert.equal(output.readinessStatus, 'draft_outline_only')
})

test('research-heavy task with no factual source becomes Needs research', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-research',
    taskTitle: 'Assignment No. 3/Research: Top 10',
    taskDetails: 'Investigate and analyze the top 10 most infamous malware, viruses, and security threats from the past decade.',
    deadline: null,
    priority: 'high',
    courseName: 'IT Security',
    moduleTitle: 'Security Threats',
    resourceSnippet: null,
    sourceText: null,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  const readiness = evaluateTaskOutputReadiness({
    request,
    previewContent: [
      'Research-ready draft',
      '',
      'Selection criteria: impact, spread, technical significance, and relevance within the past decade.',
      'Research fields: name, year, threat type, attack method, affected systems, impact, mitigation, and citation.',
      'Recommended source categories: government advisories, vendor threat reports, academic or security research, and incident writeups.',
      'Citation checklist: collect author or organization, publication date, title, URL, and access date for each source.',
    ].join('\n'),
  })

  assert.equal(readiness.status, 'needs_research')
  assert.equal(readiness.label, 'Needs research')
})

test('course-specific task with no readable source becomes Needs source content', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-source-needed',
    taskTitle: 'Module Reading Response',
    taskDetails: 'Answer using the module reading and course notes: What is the author’s main argument?',
    deadline: null,
    priority: 'medium',
    courseName: 'Reading Seminar',
    moduleTitle: 'Module 2',
    resourceSnippet: null,
    sourceText: null,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  const readiness = evaluateTaskOutputReadiness({
    request,
    previewContent: 'The response needs the module reading before it can identify the author’s main argument safely.',
  })

  assert.equal(readiness.status, 'needs_course_source_content')
  assert.equal(readiness.label, 'Needs source content')
})

test('completed answer with substantive source-grounded content is ready', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-complete',
    taskTitle: 'Water Cycle Analysis',
    taskDetails: 'Explain how evaporation, condensation, and precipitation work together in the water cycle.',
    deadline: null,
    priority: 'medium',
    courseName: 'Earth Science',
    moduleTitle: 'Weather Systems',
    resourceSnippet: 'Evaporation moves water from the surface into the atmosphere as vapor when heat energy is added.',
    sourceText: 'Condensation happens when water vapor cools and forms droplets in clouds. Precipitation returns water to Earth as rain, snow, sleet, or hail, which keeps the cycle moving.',
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'pdf',
  })

  const readiness = evaluateTaskOutputReadiness({
    request,
    previewContent: [
      'Evaporation, condensation, and precipitation work together as connected stages of the water cycle. Evaporation begins when heat energy changes surface water into water vapor, moving moisture into the atmosphere. As that vapor cools, condensation forms tiny droplets that gather into clouds. Precipitation then returns the water to Earth as rain, snow, sleet, or hail, which lets the cycle continue through new runoff, collection, and later evaporation.',
      '',
      'This sequence matters because each stage depends on the one before it. Without evaporation, there is not enough water vapor for cloud formation. Without condensation, the vapor would not collect into droplets. Without precipitation, water would not return to the surface where people, plants, rivers, and oceans can use it again.',
    ].join('\n'),
  })

  assert.equal(readiness.status, 'ready')
  assert.equal(readiness.ready, true)
})

test('refinement prompt includes original task, source context, previous output, and user instruction', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-refine',
    taskTitle: 'Discussion Post',
    taskDetails: 'Write a discussion post explaining one benefit of regular physical activity for students.',
    deadline: null,
    priority: 'medium',
    courseName: 'PATHFit',
    moduleTitle: 'Wellness',
    resourceSnippet: 'The module says regular physical activity can reduce stress and support daily energy.',
    sourceText: 'Consistent movement supports wellness by improving mood, stamina, and stress management routines.',
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })
  const refinedRequest = {
    ...request,
    previousOutput: 'Regular activity helps students manage stress and stay energized.',
    refinementInstruction: 'Make this sound more formal.',
  }

  const prompt = buildTaskOutputUserPrompt(refinedRequest)

  assert.match(prompt, /Task title: Discussion Post/)
  assert.match(prompt, /regular physical activity can reduce stress/)
  assert.match(prompt, /Previous output to revise:/)
  assert.match(prompt, /Regular activity helps students manage stress/)
  assert.match(prompt, /User refinement request:/)
  assert.match(prompt, /Make this sound more formal/)
  assert.doesNotMatch(prompt, /Source key:/)
})

test('refinement does not bypass readiness rules', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-refine-research',
    taskTitle: 'Current Events Analysis',
    taskDetails: 'Research and analyze three current cybersecurity incidents with citations.',
    deadline: null,
    priority: 'medium',
    courseName: 'Security',
    moduleTitle: 'Current Threats',
    resourceSnippet: null,
    sourceText: null,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })
  const refinedRequest = {
    ...request,
    previousOutput: 'Research plan with citation checklist.',
    refinementInstruction: 'Make it look complete.',
  }

  const output = normalizeTaskOutputModelResponse({
    title: 'Current Events Analysis',
    summary: 'Refined report.',
    previewMode: 'rich_text',
    previewContent: 'Incident 1: Add source. Incident 2: Add source. Incident 3: Add source. References: add citations.',
    stylesheet: null,
    script: null,
    groundingNote: 'No factual sources were surfaced.',
    limitationNote: null,
    warnings: [],
    requirementsUsed: request.requirements,
    selectedContextUsed: [],
  }, refinedRequest, null)

  assert.equal(output.readinessStatus, 'needs_research')
})

test('weak task-output grounding falls back to scaffold-only export bundle', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-2',
    taskTitle: 'Case Brief',
    taskDetails: 'Prepare a case brief.',
    deadline: '2026-05-20',
    priority: 'medium',
    courseName: 'Legal Writing',
    moduleTitle: 'Intro Cases',
    resourceSnippet: 'OCR status: weak',
    sourceText: 'uuid: 123e4567-e89b-12d3-a456-426614174000',
    sourceNote: 'Debug: extraction failed',
    moduleSummary: 'Fallback summary should not count.',
  }, {
    preset: 'documentation',
    outputType: 'pdf',
  })

  assert.equal(request.groundingStatus, 'limited')

  const fallback = buildTaskOutputFallback(request)
  assert.equal(fallback.version, 'task-output-v1')
  assert.equal(fallback.title, 'Case Brief')
  assert.equal(fallback.groundingStatus, 'limited')
  assert.ok(fallback.groundingNote.includes('partial readable task/source text'))
  assert.ok(fallback.limitationNote?.includes('before submission'))
  assert.equal(/OCR status:|uuid:|Debug:/i.test(fallback.previewContent), false)
  assert.equal(fallback.exports.length, 2)
  assert.equal(fallback.exports.some((file) => file.filename.endsWith('.html')), true)
  assert.equal(fallback.exports.some((file) => file.filename.endsWith('.txt')), true)
})

test('task output HTML exports stay deterministic and revision history appends newest first', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-3',
    taskTitle: 'Portfolio Page',
    taskDetails: 'Build a one-page portfolio site with a hero and project section.',
    deadline: '2026-05-30',
    priority: 'low',
    courseName: 'Web Design',
    moduleTitle: 'Portfolio Sprint',
    resourceSnippet: 'The page should introduce the student and show two highlighted projects.',
    sourceText: 'Use clean headings, short project descriptions, and one call to action.',
    sourceNote: 'Stay minimal and readable on mobile.',
    moduleSummary: null,
  }, {
    preset: 'webpage',
    outputType: 'html',
  })

  const previous: StudyOutputTaskOutputContent = {
    version: 'task-output-v1',
    sourceTaskId: 'task-3',
    taskTitle: 'Portfolio Page',
    preset: 'webpage',
    outputType: 'html',
    previewMode: 'html',
    title: 'Portfolio Page Webpage',
    summary: 'Older revision',
    previewContent: '<main>Old preview</main>',
    stylesheet: 'body { color: black; }',
    script: null,
    requirementSummary: 'Old requirement summary',
    requirements: ['Add a hero section'],
    selectedContext: ['Old context'],
    groundingStatus: 'grounded',
    groundingNote: 'Old note',
    limitationNote: null,
    warnings: [],
    exports: [],
    revisionHistory: [{
      id: 'rev-1',
      createdAt: '2026-05-08T00:00:00.000Z',
      label: 'Initial generation',
      summary: 'webpage -> html',
      outputType: 'html',
      preset: 'webpage',
      groundingStatus: 'grounded',
    }],
  }

  const normalized = normalizeTaskOutputModelResponse({
    title: 'Portfolio Page Webpage',
    summary: 'Grounded first-pass webpage.',
    previewMode: 'html',
    previewContent: '<main class="task-output-shell"><section><h1>Portfolio</h1></section></main>',
    stylesheet: '.task-output-shell { max-width: 60rem; margin: 0 auto; }',
    script: 'console.log("portfolio")',
    groundingNote: 'Grounded in the surfaced task requirements and readable source text.',
    limitationNote: null,
    warnings: [],
    requirementsUsed: ['Add a hero section', 'Show two highlighted projects'],
    selectedContextUsed: ['Use clean headings and one call to action.'],
  }, request, previous)

  assert.equal(normalized.exports.length, 1)
  assert.equal(normalized.exports[0]?.filename.endsWith('.html'), true)
  assert.ok(normalized.exports[0]?.content.includes('<!doctype html>'))
  assert.ok(normalized.exports[0]?.content.includes('activity-submission'))
  assert.ok(normalized.exports[0]?.content.includes('console.log("portfolio")'))
  assert.equal(normalized.revisionHistory.length, 2)
  assert.equal(normalized.revisionHistory[0]?.label, 'Revision 2')
  assert.equal(normalized.revisionHistory[1]?.label, 'Initial generation')
})
