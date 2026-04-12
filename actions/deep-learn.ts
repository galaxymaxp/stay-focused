'use server'

import { revalidatePath } from 'next/cache'
import { buildLearnExperience, extractCourseName, getModuleWorkspace } from '@/lib/module-workspace'
import { generateDeepLearnNoteForResource } from '@/lib/deep-learn-generation'
import { DEEP_LEARN_PROMPT_VERSION, buildDeepLearnNoteBody, computeDeepLearnQuizReady } from '@/lib/deep-learn'
import { saveDeepLearnNote } from '@/lib/deep-learn-store'
import { supabase } from '@/lib/supabase'

export async function generateDeepLearnNoteAction(input: {
  moduleId: string
  resourceId: string
  courseId?: string | null
}) {
  const workspace = await getModuleWorkspace(input.moduleId)
  if (!workspace) {
    throw new Error('The module could not be loaded for Deep Learn.')
  }

  const storedResource = workspace.resources.find((resource) => resource.id === input.resourceId)
  if (!storedResource) {
    throw new Error('The selected resource could not be found.')
  }

  const courseName = extractCourseName(workspace.module.raw_content)
  const experience = buildLearnExperience(workspace.module, {
    taskCount: workspace.tasks.length,
    deadlineCount: workspace.deadlines.length,
    resources: workspace.resources,
    resourceStudyStates: workspace.resourceStudyStates,
  })
  const resource = experience.resources.find((entry) => entry.id === input.resourceId)

  if (!resource) {
    throw new Error('The selected study resource is not available in Learn.')
  }

  const linkedTask = workspace.tasks.find((task) => matchesByTitle(task.title, resource.title)) ?? null

  await saveDeepLearnNote({
    moduleId: workspace.module.id,
    courseId: workspace.module.courseId ?? input.courseId ?? null,
    resourceId: resource.id,
    status: 'pending',
    title: resource.title,
    overview: 'Deep Learn is preparing the study note.',
    sections: [],
    noteBody: '',
    coreTerms: [],
    keyFacts: [],
    distinctions: [],
    likelyQuizPoints: [],
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

    if (generated.refreshedResource && supabase) {
      await supabase
        .from('module_resources')
        .update({
          extraction_status: generated.refreshedResource.extractionStatus,
          extracted_text: generated.refreshedResource.extractedText,
          extracted_text_preview: generated.refreshedResource.extractedTextPreview,
          extracted_char_count: generated.refreshedResource.extractedCharCount,
          extraction_error: generated.refreshedResource.extractionError,
          metadata: generated.refreshedResource.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq('id', generated.refreshedResource.id)
    }

    const note = await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: resource.id,
      status: 'ready',
      title: generated.content.title,
      overview: generated.content.overview,
      sections: generated.content.sections,
      noteBody: buildDeepLearnNoteBody(generated.content.sections),
      coreTerms: generated.content.coreTerms,
      keyFacts: generated.content.keyFacts,
      distinctions: generated.content.distinctions,
      likelyQuizPoints: generated.content.likelyQuizPoints,
      cautionNotes: generated.content.cautionNotes,
      sourceGrounding: generated.sourceGrounding,
      quizReady: computeDeepLearnQuizReady(generated.content),
      promptVersion: DEEP_LEARN_PROMPT_VERSION,
      errorMessage: null,
      generatedAt: new Date().toISOString(),
    })

    revalidateDeepLearnPaths(workspace.module.id, workspace.module.courseId ?? input.courseId ?? null, resource.id)

    return {
      status: note.status,
      moduleId: workspace.module.id,
      resourceId: resource.id,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Deep Learn generation failed.'

    await saveDeepLearnNote({
      moduleId: workspace.module.id,
      courseId: workspace.module.courseId ?? input.courseId ?? null,
      resourceId: resource.id,
      status: 'failed',
      title: resource.title,
      overview: 'Deep Learn could not build a trustworthy note from the current source evidence.',
      sections: [],
      noteBody: '',
      coreTerms: [],
      keyFacts: [],
      distinctions: [],
      likelyQuizPoints: [],
      cautionNotes: [message],
      sourceGrounding: {
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

    revalidateDeepLearnPaths(workspace.module.id, workspace.module.courseId ?? input.courseId ?? null, resource.id)

    return {
      status: 'failed' as const,
      moduleId: workspace.module.id,
      resourceId: resource.id,
      error: message,
    }
  }
}

function revalidateDeepLearnPaths(moduleId: string, courseId: string | null, resourceId: string) {
  revalidatePath('/learn')
  revalidatePath('/courses')
  if (courseId) {
    revalidatePath(`/courses/${courseId}/learn`)
  }
  revalidatePath(`/modules/${moduleId}`)
  revalidatePath(`/modules/${moduleId}/learn`)
  revalidatePath(`/modules/${moduleId}/quiz`)
  revalidatePath(`/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`)
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
