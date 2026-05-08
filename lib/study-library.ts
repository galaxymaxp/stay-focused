import { resolveStudyLibraryHref, type DraftShelfItem, type StudyLibraryItem } from '@/lib/types'

export function toStudyLibraryItem(
  draft: DraftShelfItem,
  courseNames: Map<string, { id: string; name: string; code: string }>,
): StudyLibraryItem {
  const kind = draft.sourceType === 'task' ? 'task' : 'learning'
  const courseTitle = draft.courseId ? courseNames.get(draft.courseId)?.name : undefined

  return {
    id: draft.id,
    title: draft.title,
    kind,
    entryKind: draft.entryKind,
    subtitle: getLibrarySubtitle(draft),
    courseTitle,
    moduleTitle: draft.moduleTitle ?? undefined,
    taskTitle: kind === 'task' ? draft.title : undefined,
    updatedAt: draft.updatedAt,
    href: resolveStudyLibraryHref(draft),
    studyOutputKind: draft.studyOutputKind ?? null,
  }
}

export function getLibrarySubtitle(draft: DraftShelfItem) {
  if (draft.entryKind === 'study_output') {
    if (draft.studyOutputKind === 'reviewer') return 'Reviewer'
    if (draft.studyOutputKind === 'quiz_pack') return 'Quiz pack'
    if (draft.studyOutputKind === 'task_output') return 'Task output'
    if (draft.studyOutputKind === 'study_sheet') return 'Study sheet'
    if (draft.studyOutputKind === 'cram_sheet') return 'Cram sheet'
    return 'Study output'
  }

  if (draft.entryKind === 'deep_learn_note') return 'Exam prep pack'
  if (draft.draftType === 'flashcard_set') return 'Flashcard set'
  if (draft.draftType === 'study_notes' && draft.sourceType === 'task') return 'Task draft'
  if (draft.draftType === 'study_notes') return 'Study notes'
  if (draft.draftType === 'summary') return 'Summary'
  return 'Study output'
}

export function groupItemsByCourse(
  items: StudyLibraryItem[],
  draftById: Map<string, DraftShelfItem>,
  courseNames: Map<string, { id: string; name: string; code: string }>,
) {
  const groups = new Map<string, StudyLibraryItem[]>()

  items.forEach((item) => {
    const courseId = draftById.get(item.id)?.courseId ?? null
    const key = courseId ?? 'uncategorized'
    groups.set(key, [...(groups.get(key) ?? []), item])
  })

  return Array.from(groups.entries())
    .map(([courseKey, groupItems]) => {
      const course = courseKey === 'uncategorized' ? null : courseNames.get(courseKey) ?? null
      return {
        courseTitle: course?.name ?? null,
        courseCode: course?.code ?? '',
        items: groupItems.sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()),
      }
    })
    .sort((a, b) => new Date(b.items[0]?.updatedAt ?? 0).getTime() - new Date(a.items[0]?.updatedAt ?? 0).getTime())
}
