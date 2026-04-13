'use server'

import { revalidatePath } from 'next/cache'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { buildLearnExperience, extractCourseName, getModuleWorkspace, resolveLearnResourceSelection } from '@/lib/module-workspace'
import { DeepLearnGenerationBlockedError, generateDeepLearnNoteForResource } from '@/lib/deep-learn-generation'
import { DEEP_LEARN_PROMPT_VERSION, buildDeepLearnNoteBody, computeDeepLearnQuizReady } from '@/lib/deep-learn'
import { classifyDeepLearnResourceReadiness } from '@/lib/deep-learn-readiness'
import { saveDeepLearnNote } from '@/lib/deep-learn-store'
import { supabase } from '@/lib/supabase'

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

function revalidateDeepLearnPaths(moduleId: string, courseId: string | null, resourceId: string, detailResourceId = resourceId) {
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (courseId) {
    revalidatePath(`/courses/${courseId}/learn`)
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
      metadata: refreshedResource.metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', refreshedResource.id)
}
