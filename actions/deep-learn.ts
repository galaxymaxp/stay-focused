'use server'

import { revalidatePath } from 'next/cache'
import OpenAI from 'openai'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { buildLearnExperience, extractCourseName, getModuleWorkspace, resolveLearnResourceSelection } from '@/lib/module-workspace'
import { DeepLearnGenerationBlockedError, generateDeepLearnNoteForResource } from '@/lib/deep-learn-generation'
import { DEEP_LEARN_PROMPT_VERSION, buildDeepLearnNoteBody, computeDeepLearnQuizReady } from '@/lib/deep-learn'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { getDeepLearnNoteForResource, saveDeepLearnNote } from '@/lib/deep-learn-store'
import { supabase } from '@/lib/supabase'
import type { DeepLearnNoteSection } from '@/lib/types'

export async function generateDeepLearnNoteAction(input: {
  moduleId: string
  resourceId: string
  courseId?: string | null
}) {
  const user = await getAuthenticatedUserServer()
  console.info('[deep-learn-action] generate_requested', {
    moduleId: input.moduleId,
    resourceId: input.resourceId,
    userId: user?.id ?? null,
    queryIntent: 'generate_note_for_resource_detail_or_learn_card',
    lookupMode: 'app_resource_id_first',
  })

  const workspace = await getModuleWorkspace(input.moduleId)
  if (!workspace) {
    console.error('[deep-learn-action] module_lookup_failed', {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      userId: user?.id ?? null,
      queryIntent: 'generate_note_for_resource_detail_or_learn_card',
      failureReason: 'module_not_available',
    })
    throw new Error('The module could not be loaded for Deep Learn.')
  }

  const courseName = extractCourseName(workspace.module.raw_content)
  const experience = buildLearnExperience(workspace.module, {
    taskCount: workspace.tasks.length,
    deadlineCount: workspace.deadlines.length,
    resources: workspace.resources,
    resourceStudyStates: workspace.resourceStudyStates,
  })
  const selection = resolveLearnResourceSelection(experience, workspace.resources, input.resourceId)

  if (!selection) {
    console.error('[deep-learn-action] resource_lookup_failed', {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      userId: user?.id ?? null,
      queryIntent: 'generate_note_for_resource_detail_or_learn_card',
      lookupMode: 'not_found_in_learn_experience',
      failureReason: 'resource_missing',
    })
    throw new Error('The selected study resource is not available in Learn.')
  }

  const {
    resource,
    storedResource,
    canonicalResourceId,
    matchedBy,
  } = selection

  const readiness = classifyDeepLearnResourceReadiness({
    resource,
    storedResource,
    canonicalResourceId,
  })

  if (!storedResource || !canonicalResourceId || readiness.state === 'unreadable') {
    console.error('[deep-learn-action] resource_lookup_failed', {
      moduleId: input.moduleId,
      resourceId: input.resourceId,
      userId: user?.id ?? null,
      resolvedResourceId: canonicalResourceId,
      queryIntent: 'generate_note_for_resource_detail_or_learn_card',
      lookupMode: matchedBy,
      failureReason: readiness.blockedReason ?? 'stored_resource_missing',
    })
    throw new Error(readiness.detail)
  }

  console.info('[deep-learn-action] resource_resolved', {
    moduleId: input.moduleId,
    resourceId: input.resourceId,
    resolvedResourceId: canonicalResourceId,
    userId: user?.id ?? null,
    queryIntent: 'generate_note_for_resource_detail_or_learn_card',
    lookupMode: matchedBy,
  })

  const linkedTask = workspace.tasks.find((task) => matchesByTitle(task.title, resource.title)) ?? null

  await saveDeepLearnNote({
    moduleId: workspace.module.id,
    courseId: workspace.module.courseId ?? input.courseId ?? null,
    resourceId: canonicalResourceId,
    status: 'pending',
    title: resource.title,
    overview: readiness.state === 'scan_fallback'
      ? 'Deep Learn is preparing an exam prep pack from scan fallback.'
      : readiness.state === 'partial_text'
        ? 'Deep Learn is tightening the source before it builds the exam prep pack.'
        : 'Deep Learn is preparing the exam prep pack.',
    sections: [],
    noteBody: '',
    answerBank: [],
    identificationItems: [],
    distinctions: [],
    likelyQuizTargets: [],
    cautionNotes: [],
    sourceGrounding: {
      sourceType: resource.type,
      extractionQuality: resource.quality ?? null,
      groundingStrategy: 'insufficient',
      usedAiFallback: false,
      qualityReason: resource.qualityReason ?? null,
      warning: null,
      charCount: 0,
    },
    quizReady: false,
    promptVersion: DEEP_LEARN_PROMPT_VERSION,
    errorMessage: null,
    generatedAt: null,
  })

  try {
    const generated = await generateDeepLearnNoteForResource({
      module: workspace.module,
      courseName,
      resource,
      storedResource,
      linkedTask,
    })

    await persistRefreshedResource(generated.refreshedResource)

    const note = await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: canonicalResourceId,
      status: 'ready',
      title: generated.content.title,
      overview: generated.content.overview,
      sections: generated.content.sections,
      noteBody: buildDeepLearnNoteBody(generated.content.sections),
      answerBank: generated.content.answerBank,
      identificationItems: generated.content.identificationItems,
      distinctions: generated.content.distinctions,
      likelyQuizTargets: generated.content.likelyQuizTargets,
      cautionNotes: generated.content.cautionNotes,
      sourceGrounding: generated.sourceGrounding,
      quizReady: computeDeepLearnQuizReady(generated.content),
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: null,
      generatedAt: new Date().toISOString(),
    })

    revalidateDeepLearnPaths(
      workspace.module.id,
      workspace.module.courseId ?? input.courseId ?? null,
      canonicalResourceId,
      input.resourceId,
    )

    return {
      status: note.status,
      moduleId: workspace.module.id,
      resourceId: canonicalResourceId,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deep Learn generation failed.'
    const refreshedResource = error instanceof DeepLearnGenerationBlockedError
      ? error.refreshedResource
      : null

    await persistRefreshedResource(refreshedResource)

    await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: canonicalResourceId,
      status: 'failed',
      title: resource.title,
      overview: error instanceof DeepLearnGenerationBlockedError
        ? 'Deep Learn could not recover enough trustworthy source evidence for this exam prep pack.'
        : 'Deep Learn could not build a trustworthy exam prep pack from the current source evidence.',
      sections: [],
      noteBody: '',
      answerBank: [],
      identificationItems: [],
      distinctions: [],
      likelyQuizTargets: [],
      cautionNotes: [message],
      sourceGrounding: error instanceof DeepLearnGenerationBlockedError
        ? error.sourceGrounding
        : {
            sourceType: resource.type,
            extractionQuality: resource.quality ?? null,
            groundingStrategy: 'insufficient',
            usedAiFallback: true,
            qualityReason: resource.qualityReason ?? null,
            warning: resource.extractionError ?? null,
            charCount: 0,
          },
      quizReady: false,
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: message,
      generatedAt: null,
    })

    revalidateDeepLearnPaths(
      workspace.module.id,
      workspace.module.courseId ?? input.courseId ?? null,
      canonicalResourceId,
      input.resourceId,
    )

    return {
      status: 'failed' as const,
      moduleId: workspace.module.id,
      resourceId: canonicalResourceId,
      error: message,
    }
  }
}

export async function updateDeepLearnBuildBodyAction(input: {
  moduleId: string
  resourceId: string
  bodyMarkdown: string
}) {
  const noteResult = await getDeepLearnNoteForResource(input.moduleId, input.resourceId)
  const note = noteResult.note
  if (!note) throw new Error('Draft needs a saved Deep Learn item before it can edit content.')

  await saveDeepLearnNote({
    moduleId: note.moduleId,
    courseId: note.courseId,
    resourceId: note.resourceId,
    status: note.status,
    title: note.title,
    overview: note.overview,
    sections: sectionsFromMarkdown(input.bodyMarkdown, note.sections),
    noteBody: input.bodyMarkdown,
    answerBank: note.answerBank,
    identificationItems: note.identificationItems,
    distinctions: note.distinctions,
    likelyQuizTargets: note.likelyQuizTargets,
    cautionNotes: note.cautionNotes,
    sourceGrounding: note.sourceGrounding,
    quizReady: note.quizReady,
    promptVersion: note.promptVersion,
    errorMessage: note.errorMessage,
    generatedAt: note.generatedAt,
  })

  revalidateDeepLearnPaths(note.moduleId, note.courseId, note.resourceId)
}

export async function refineDeepLearnBuildBodyAction(input: {
  moduleId: string
  resourceId: string
  instruction: string
}) {
  const instruction = input.instruction.trim()
  if (!instruction) throw new Error('Refinement instruction is required.')

  const noteResult = await getDeepLearnNoteForResource(input.moduleId, input.resourceId)
  const note = noteResult.note
  if (!note) throw new Error('Draft needs a saved Deep Learn item before it can refine content.')

  const workspace = await getModuleWorkspace(input.moduleId)
  const sourceContext = workspace
    ? buildLearnExperience(workspace.module, {
        taskCount: workspace.tasks.length,
        deadlineCount: workspace.deadlines.length,
        resources: workspace.resources,
        resourceStudyStates: workspace.resourceStudyStates,
      }).resources.find((resource) => resource.id === input.resourceId)
    : null

  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You refine a Deep Learn build draft for a student. Return only JSON with { "title": "string", "overview": "string", "body_markdown": "string" }. Keep review facts grounded in the source. Preserve useful existing structure unless the instruction asks for a change.',
      },
      {
        role: 'user',
        content: [
          `Current Deep Learn build draft:\n\n${note.noteBody}`,
          `Source context:\n\n${(sourceContext?.extractedText ?? sourceContext?.extractedTextPreview ?? '').slice(0, 20000)}`,
          `Instruction:\n\n${instruction}`,
        ].join('\n\n---\n\n'),
      },
    ],
    max_tokens: 12000,
    temperature: 0.25,
  })

  const raw = response.choices[0]?.message?.content
  if (!raw) throw new Error('Refinement returned no content.')

  let parsed: { title?: string; overview?: string; body_markdown?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('Refinement returned invalid content.')
  }

  const bodyMarkdown = parsed.body_markdown?.trim()
  if (!bodyMarkdown) throw new Error('Refinement returned an empty build draft.')

  await saveDeepLearnNote({
    moduleId: note.moduleId,
    courseId: note.courseId,
    resourceId: note.resourceId,
    status: 'ready',
    title: parsed.title?.trim() || note.title,
    overview: parsed.overview?.trim() || note.overview,
    sections: sectionsFromMarkdown(bodyMarkdown, note.sections),
    noteBody: bodyMarkdown,
    answerBank: note.answerBank,
    identificationItems: note.identificationItems,
    distinctions: note.distinctions,
    likelyQuizTargets: note.likelyQuizTargets,
    cautionNotes: note.cautionNotes,
    sourceGrounding: note.sourceGrounding,
    quizReady: note.quizReady,
    promptVersion: note.promptVersion,
    errorMessage: null,
    generatedAt: note.generatedAt,
  })

  revalidateDeepLearnPaths(note.moduleId, note.courseId, note.resourceId)
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured.')
  return new OpenAI({ apiKey })
}

function sectionsFromMarkdown(markdown: string, fallback: DeepLearnNoteSection[]) {
  const blocks = markdown
    .split(/\n(?=#{1,3}\s+)/)
    .map((block) => block.trim())
    .filter(Boolean)

  const sections = blocks
    .map((block, index) => {
      const lines = block.split('\n')
      const headingLine = lines[0]?.replace(/^#{1,3}\s*/, '').trim()
      const body = lines.slice(1).join('\n').trim()
      if (!headingLine || !body) return null
      return {
        heading: headingLine.slice(0, 180),
        body,
        order: index,
      }
    })
    .filter((section): section is DeepLearnNoteSection & { order: number } => Boolean(section))
    .slice(0, 6)
    .map(({ heading, body }) => ({ heading, body }))

  return sections.length > 0 ? sections : fallback
}

function revalidateDeepLearnPaths(moduleId: string, courseId: string | null, resourceId: string, detailResourceId = resourceId) {
  revalidatePath('/drafts')
  revalidatePath('/library')
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (courseId) {
    revalidatePath(`/courses/${courseId}`)
  }
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/quiz`)
  revalidatePath(`/modules/${moduleId}/learn/notes/${encodeURIComponent(resourceId)}`)
  revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
  if (detailResourceId !== resourceId) {
    revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(detailResourceId)}`)
  }
}

function matchesByTitle(left: string, right: string) {
  const normalizedLeft = normalizeLookup(left)
  const normalizedRight = normalizeLookup(right)
  return normalizedLeft === normalizedRight
    || normalizedLeft.includes(normalizedRight)
    || normalizedRight.includes(normalizedLeft)
}

function normalizeLookup(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

async function persistRefreshedResource(
  refreshedResource: Awaited<ReturnType<typeof generateDeepLearnNoteForResource>>['refreshedResource'] | null,
) {
  if (!refreshedResource || !supabase) {
    return
  }

  await supabase
    .from('module_resources')
    .update({
      extraction_status: refreshedResource.extractionStatus,
      extracted_text: refreshedResource.extractedText,
      extracted_text_preview: refreshedResource.extractedTextPreview,
      extracted_char_count: refreshedResource.extractedCharCount,
      extraction_error: refreshedResource.extractionError,
      visual_extraction_status: refreshedResource.visualExtractionStatus,
      visual_extracted_text: refreshedResource.visualExtractedText,
      visual_extraction_error: refreshedResource.visualExtractionError,
      page_count: refreshedResource.pageCount,
      pages_processed: refreshedResource.pagesProcessed,
      extraction_provider: refreshedResource.extractionProvider,
      metadata: refreshedResource.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', refreshedResource.id)
}
