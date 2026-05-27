import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildTaskOutputFallback,
  buildTaskOutputRequest,
  buildTaskOutputUserPrompt,
  classifyTaskOutputSourceMode,
  detectTaskOutputFormat,
  evaluateTaskOutputReadiness,
  normalizeTaskOutputModelResponse,
} from '../lib/task-output'
import { getTaskOutputModelForRequest, requiresNewUnsupportedFacts } from '../lib/task-output-model-routing'
import { selectTaskOutputRelatedResources } from '../lib/task-output-context'
import type { ModuleResource, StudyOutputTaskOutputContent } from '../lib/types'

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
  assert.equal(request.sourceMode, 'course_grounded')
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
  assert.equal(request.sourceMode, 'course_grounded')
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

test('initial task output generation uses configured GPT-5.4 non-mini model', () => {
  const routing = getTaskOutputModelForRequest({
    previousOutput: null,
    refinementInstruction: null,
  }, {} as unknown as NodeJS.ProcessEnv)

  assert.equal(routing.mode, 'initial_full')
  assert.equal(routing.model, 'gpt-5.4')
  assert.doesNotMatch(routing.model, /mini/i)
})

test('tone and format refinement uses configured mini model', () => {
  const routing = getTaskOutputModelForRequest({
    previousOutput: 'Needs research draft.',
    refinementInstruction: 'Make this more formal and turn it into a table.',
  }, {
    OPENAI_TASK_OUTPUT_FULL_MODEL: 'gpt-5.4-full',
    OPENAI_TASK_OUTPUT_REFINEMENT_MODEL: 'gpt-5-mini-refine',
  } as unknown as NodeJS.ProcessEnv)

  assert.equal(routing.mode, 'refinement_reshape')
  assert.equal(routing.model, 'gpt-5-mini-refine')
})

test('factual or citation refinement routes away from mini', () => {
  const routing = getTaskOutputModelForRequest({
    previousOutput: 'Needs research draft.',
    refinementInstruction: 'Make it complete with APA references and the top 10 malware.',
  }, {
    OPENAI_TASK_OUTPUT_FULL_MODEL: 'gpt-5.4-full',
    OPENAI_TASK_OUTPUT_REFINEMENT_MODEL: 'gpt-5-mini-refine',
  } as unknown as NodeJS.ProcessEnv)

  assert.equal(routing.mode, 'refinement_needs_facts')
  assert.equal(routing.model, 'gpt-5.4-full')
  assert.equal(requiresNewUnsupportedFacts('Add APA references and current examples.'), true)
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

test('research assignment with weak course context uses general research mode and can produce a completed report', () => {
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

  assert.equal(request.sourceMode, 'general_research_labeled')

  const report = buildCompletedGeneralResearchReport()
  const output = normalizeTaskOutputModelResponse({
    title: 'Top 10 Malware, Viruses, and Security Threats Report',
    summary: 'Completed report prepared with general/background research labeling.',
    previewMode: 'rich_text',
    previewContent: report,
    stylesheet: null,
    script: null,
    groundingNote: 'General/background research was used because course-provided source content was insufficient.',
    limitationNote: 'General/background references should be verified before final submission.',
    warnings: ['Course-provided source content was insufficient, so this report uses labeled general/background research.'],
    requirementsUsed: request.requirements,
    selectedContextUsed: [],
  }, request, null)

  assert.equal(output.sourceMode, 'general_research_labeled')
  assert.equal(output.readinessStatus, 'ready')
  assert.match(output.previewContent, /General\/background research note/i)
  assert.match(output.previewContent, /Threat summary table/i)
  assert.match(output.previewContent, /10\. Mirai/i)
  assert.doesNotMatch(output.previewContent, /research needed|add source|fill in|to be completed after research|____/i)
})

test('course-grounded assignment with enough source context stays course grounded', () => {
  const source = Array.from({ length: 8 }, () => [
    'Network segmentation limits lateral movement by separating sensitive systems from general user traffic.',
    'Least privilege reduces account misuse by giving users only the access needed for assigned duties.',
    'Incident response plans define detection, containment, eradication, recovery, and lessons learned steps.',
  ].join(' ')).join('\n')
  const request = buildTaskOutputRequest({
    taskId: 'task-course-grounded',
    taskTitle: 'Security Controls Analysis',
    taskDetails: 'Analyze the module reading and explain how three security controls reduce organizational risk.',
    deadline: null,
    priority: 'medium',
    courseName: 'IT Security',
    moduleTitle: 'Security Controls',
    resourceSnippet: source,
    sourceText: source,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  assert.equal(request.groundingStatus, 'grounded')
  assert.equal(request.sourceMode, 'course_grounded')
})

test('non-research assignment with insufficient context uses source-limited scaffold mode', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-source-limited',
    taskTitle: 'Module Reading Response',
    taskDetails: 'Answer using the module reading and course notes: What is the author\'s main argument?',
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

  assert.equal(request.groundingStatus, 'grounded')
  assert.equal(request.sourceMode, 'source_limited_scaffold')
})

test('general research report needs honest labeling and cannot fake course-provided sources', () => {
  const request = {
    ...buildTaskOutputRequest({
      taskId: 'task-fake-course-source',
      taskTitle: 'Research Malware Trends',
      taskDetails: 'Research and analyze malware trends with references.',
      deadline: null,
      priority: 'high' as const,
      courseName: 'IT Security',
      moduleTitle: 'Threats',
      resourceSnippet: null,
      sourceText: null,
      sourceNote: null,
      moduleSummary: null,
    }, {
      preset: 'report',
      outputType: 'docx',
    }),
    sourceMode: 'general_research_labeled' as const,
  }

  const missingLabel = evaluateTaskOutputReadiness({
    request,
    previewContent: 'This completed malware report explains ransomware, worms, botnets, phishing, credential theft, supply chain attacks, destructive malware, banking Trojans, spyware, and cryptojacking with analysis, recommendations, and references.',
  })
  assert.equal(missingLabel.ready, false)
  assert.ok(missingLabel.reasons.includes('missing_general_research_label'))

  const fakeCourseSource = evaluateTaskOutputReadiness({
    request,
    previewContent: `${buildCompletedGeneralResearchReport()}\n\nThese are course-provided sources from the selected course sources.`,
  })
  assert.equal(fakeCourseSource.ready, false)
  assert.ok(fakeCourseSource.reasons.includes('fake_course_source_claim'))
})

test('task output normalizer removes internal source mode labels from user-visible content', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-internal-label',
    taskTitle: 'Research Malware Trends',
    taskDetails: 'Research and analyze malware trends with references.',
    deadline: null,
    priority: 'high',
    courseName: 'IT Security',
    moduleTitle: 'Threats',
    resourceSnippet: null,
    sourceText: null,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  const output = normalizeTaskOutputModelResponse({
    title: 'general_research_labeled Malware Report',
    summary: 'Completed in general_research_labeled mode.',
    previewMode: 'rich_text',
    previewContent: `${buildCompletedGeneralResearchReport()}\n\nMode: general_research_labeled`,
    stylesheet: null,
    script: null,
    groundingNote: 'Completed in general_research_labeled mode.',
    limitationNote: 'Do not treat source_limited_scaffold or course_grounded as visible labels.',
    warnings: ['Avoid general_research_labeled debug labels.'],
    requirementsUsed: request.requirements,
    selectedContextUsed: [],
  }, request, null)

  const userVisibleText = [
    output.title,
    output.summary,
    output.previewContent,
    output.groundingNote,
    output.limitationNote ?? '',
    ...output.warnings,
    ...output.exports.map((file) => file.content),
  ].join('\n')

  assert.doesNotMatch(userVisibleText, /general_research_labeled|course_grounded|source_limited_scaffold/)
  assert.match(output.groundingNote, /general\/background research/)
})

test('external sources required and completed after research output becomes Needs research', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-research-template',
    taskTitle: 'Assignment No. 3/Research: Top 10',
    taskDetails: 'Investigate and analyze the top 10 most infamous malware, viruses, and security threats from the past decade. Research origins, impact, propagation methods, mitigation strategies, cybersecurity significance, lessons learned, recommendations, and include APA references.',
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
      'Top 10 Malware Research Report',
      '',
      'External factual sources are required before this can be completed.',
      'Threat analyses must be completed after research.',
      'References',
      'APA references to be added after research.',
    ].join('\n'),
  })

  assert.equal(readiness.status, 'needs_research')
})

test('task output context excludes unrelated admin and backup sources for malware research', () => {
  const resources = [
    createResource('Course Syllabus', 'CLO4 requires students to prepare a Backup and Restore Plan and submit administrative requirements.'),
    createResource('Room Assignment and ODL Links', 'Room assignment, Zoom link, ODL link, and class schedule information.'),
    createResource('Curated Videos', 'General course video links and playlist reminders.'),
    createResource('Malware Case Studies', 'Malware propagation methods include phishing attachments, exploit kits, drive-by downloads, and lateral movement. Mitigation strategies include patching, backups, endpoint detection, network segmentation, and user awareness.'),
  ]

  const selected = selectTaskOutputRelatedResources(
    'Assignment No. 3/Research: Top 10 Investigate and analyze the top 10 most infamous malware, viruses, and security threats from the past decade. Include APA references.',
    resources,
  )

  assert.deepEqual(selected.map((resource) => resource.title), ['Malware Case Studies'])
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

test('mini refinement cannot relabel unsupported research content as ready', () => {
  const request = buildTaskOutputRequest({
    taskId: 'task-refine-unsupported',
    taskTitle: 'Assignment No. 3/Research: Top 10',
    taskDetails: 'Investigate and analyze the top 10 most infamous malware, viruses, and security threats from the past decade. Include APA references.',
    deadline: null,
    priority: 'high',
    courseName: 'IT Security',
    moduleTitle: 'Threats',
    resourceSnippet: null,
    sourceText: null,
    sourceNote: null,
    moduleSummary: null,
  }, {
    preset: 'report',
    outputType: 'docx',
  })

  const output = normalizeTaskOutputModelResponse({
    title: 'Top 10 Malware Report',
    summary: 'Looks polished.',
    previewMode: 'rich_text',
    previewContent: 'This report still requires external sources and APA references. Threat analyses must be completed after research.',
    stylesheet: null,
    script: null,
    groundingNote: 'No factual source context was surfaced.',
    limitationNote: null,
    warnings: [],
    requirementsUsed: request.requirements,
    selectedContextUsed: [],
  }, {
    ...request,
    previousOutput: 'Research outline.',
    refinementInstruction: 'Make it more formal.',
  }, null)

  assert.notEqual(output.readinessStatus, 'ready')
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
  assert.equal(request.sourceMode, 'source_limited_scaffold')

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
    sourceMode: 'course_grounded',
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

test('source mode classifier routes weak research deliverables to general research mode', () => {
  assert.equal(classifyTaskOutputSourceMode({
    title: 'Top 10 Technology Threats',
    instructions: 'Research and compare the top 10 technology threats in a report with references.',
    requirements: [],
    selectedContext: [],
    groundingStatus: 'limited',
    preset: 'report',
    outputType: 'docx',
  }), 'general_research_labeled')
})

test('task output API keeps enough preview content for long research reports', () => {
  const source = readFileSync('app/api/task-output/route.ts', 'utf8')

  assert.match(source, /previewContent:\s*normalizeBlockString\(raw\.previewContent,\s*60000\)/)
  assert.doesNotMatch(source, /previewContent:\s*normalizeBlockString\(raw\.previewContent,\s*24000\)/)
})

function createResource(title: string, text: string): ModuleResource {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    moduleId: 'module-1',
    title,
    resourceType: 'page',
    contentType: 'text/html',
    fileName: null,
    fileSize: null,
    sourceUrl: null,
    htmlUrl: null,
    extractedText: text,
    extractedTextPreview: text,
    extractedCharCount: text.length,
    extractionStatus: 'completed',
    extractionError: null,
    extractionProvider: null,
    visualExtractionStatus: null,
    visualExtractedText: null,
    visualExtractionError: null,
    pageCount: null,
    pagesProcessed: null,
    metadata: null,
    createdAt: '2026-05-18T00:00:00.000Z',
    updatedAt: '2026-05-18T00:00:00.000Z',
  } as unknown as ModuleResource
}

function buildCompletedGeneralResearchReport() {
  return [
    'Top 10 Malware, Viruses, and Security Threats from the Past Decade',
    '',
    'General/background research note',
    'Canvas/source material details were insufficient for this assignment, so this completed report uses cautious general/background research knowledge. References below are labeled as general/background references to verify before submission, not as selected course evidence.',
    '',
    'Introduction',
    'The past decade of security threats shows a shift from single destructive viruses toward financially motivated ransomware, credential theft, botnets, supply-chain compromise, and large-scale exploitation of internet-facing systems. These threats matter because they combine technical weaknesses with human, organizational, and recovery failures.',
    '',
    'Threat summary table',
    '| Rank | Threat | Main category | Why it matters |',
    '| --- | --- | --- | --- |',
    '| 1 | WannaCry | Ransomware worm | Rapid global spread and disruption of hospitals and public services |',
    '| 2 | NotPetya | Destructive malware | Wiper-like damage disguised as ransomware |',
    '| 3 | SolarWinds compromise | Supply-chain attack | Trusted software updates became an intrusion path |',
    '| 4 | Log4Shell exploitation | Software vulnerability exploitation | A common logging library exposed many systems |',
    '| 5 | Emotet | Malware delivery botnet | Enabled credential theft and follow-on ransomware |',
    '| 6 | Ryuk | Targeted ransomware | Focused on high-value organizational disruption |',
    '| 7 | TrickBot | Banking Trojan and loader | Supported credential theft and ransomware operations |',
    '| 8 | Colonial Pipeline ransomware incident | Ransomware impact case | Showed operational and public infrastructure consequences |',
    '| 9 | Pegasus spyware | Mobile spyware | Highlighted risks to mobile privacy and targeted surveillance |',
    '| 10 | Mirai | IoT botnet | Used insecure connected devices for large denial-of-service attacks |',
    '',
    '1. WannaCry',
    'WannaCry is widely discussed as a ransomware worm because it combined file encryption with worm-like propagation. Its importance is that patching, network segmentation, and backup readiness became visible as basic operational controls.',
    '',
    '2. NotPetya',
    'NotPetya appeared similar to ransomware but caused destructive loss at scale. It is significant because recovery planning and business continuity can matter as much as prevention.',
    '',
    '3. SolarWinds compromise',
    'The SolarWinds incident represents a supply-chain compromise in which trusted software distribution became an attack path. It shows why vendor risk, monitoring, and least privilege matter.',
    '',
    '4. Log4Shell exploitation',
    'Log4Shell showed how a widely used software component can create broad exposure across many organizations. It highlights asset inventory, dependency management, and rapid patching.',
    '',
    '5. Emotet',
    'Emotet functioned as a malware platform used for delivery and follow-on compromise. It matters because phishing, credentials, and modular malware ecosystems often connect.',
    '',
    '6. Ryuk',
    'Ryuk is associated with targeted ransomware operations against organizations. It shows how attackers can combine access, lateral movement, and pressure on recovery.',
    '',
    '7. TrickBot',
    'TrickBot is commonly discussed as a banking Trojan and loader. It matters because credential theft can become the entry point for larger incidents.',
    '',
    '8. Colonial Pipeline ransomware incident',
    'This ransomware case is important because a cyber incident affected operations and public confidence. It connects cybersecurity with continuity planning and executive decision-making.',
    '',
    '9. Pegasus spyware',
    'Pegasus is associated with highly targeted mobile spyware. It shows that endpoint security includes mobile devices, privacy risk, and protection for high-risk users.',
    '',
    '10. Mirai',
    'Mirai used insecure Internet of Things devices to build a botnet. It demonstrates why default passwords, device management, and network visibility matter.',
    '',
    'Overall analysis',
    'The common pattern is that modern threats exploit both technical and organizational weaknesses. Ransomware depends on poor recovery posture, supply-chain attacks exploit trust, botnets exploit unmanaged devices, and spyware exploits endpoints that users carry every day.',
    '',
    'Lessons learned',
    'Organizations should maintain patching, backups, network segmentation, identity protection, vendor review, monitoring, and incident response practice. Students should also notice that cybersecurity is not only a technical issue; it includes policy, people, continuity, and risk decisions.',
    '',
    'Recommendations',
    'Use multi-factor authentication, maintain tested offline backups, patch critical systems quickly, monitor endpoints and networks, train users against phishing, segment high-value systems, and prepare an incident response plan.',
    '',
    'Conclusion',
    'The most infamous threats from the past decade show that security failures can spread quickly and create real-world disruption. A strong defense combines prevention, detection, response, and recovery.',
    '',
    'References',
    'General/background references to verify before submission: Cybersecurity and Infrastructure Security Agency advisories, Microsoft security reports, Europol cybercrime reports, MITRE ATT&CK technique summaries, and major vendor threat intelligence reports. Exact URLs, publication dates, and APA formatting should be verified before final submission because no exact instructor source list was surfaced.',
  ].join('\n')
}
