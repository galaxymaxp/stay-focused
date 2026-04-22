import { notFound } from 'next/navigation'
import { DeepLearnWorkspace } from '@/components/DeepLearnWorkspace'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { getDraft } from '@/actions/drafts'
import { extractCourseName, getModuleWorkspace, type ModuleSourceResource } from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function DraftDetailPage({ params }: Props) {
  const { id } = await params
  const draft = await getDraft(id)
  if (!draft) notFound()

  const workspace = draft.sourceModuleId ? await getModuleWorkspace(draft.sourceModuleId) : null
  const moduleId = draft.sourceModuleId ?? draft.id
  const courseId = workspace?.module.courseId ?? null
  const courseName = extractCourseName(workspace?.module.raw_content)
  const resource = buildDraftResource(draft, workspace?.module.title ?? null)

  const workspaceContent = (
    <div className="command-page command-page-tight">
      <DeepLearnWorkspace
        moduleId={moduleId}
        courseId={courseId}
        resource={resource}
        deepLearnResourceId={draft.id}
        note={null}
        sourceHref={null}
        readerHref={draft.sourceModuleId ? `/modules/${draft.sourceModuleId}/learn` : '/courses'}
        statusSummary="This draft is mapped into Deep Learn as Draft, preserving edit, refine, and source-side work."
        legacyDraft={draft}
      />
    </div>
  )

  if (!workspace) {
    return <main className="page-shell">{workspaceContent}</main>
  }

  return (
    <ModuleLensShell
      currentLens="learn"
      moduleId={workspace.module.id}
      courseId={workspace.module.courseId}
      courseName={courseName}
      title={workspace.module.title}
      summary={draft.title}
    >
      {workspaceContent}
    </ModuleLensShell>
  )
}

function buildDraftResource(draft: NonNullable<Awaited<ReturnType<typeof getDraft>>>, moduleName: string | null): ModuleSourceResource {
  return {
    id: draft.id,
    title: draft.sourceTitle,
    type: draft.sourceType === 'module' ? 'module draft source' : draft.sourceType,
    required: false,
    moduleName,
    category: 'resource',
    kind: 'reference',
    lane: 'learn',
    extractedText: draft.sourceRawContent,
    extractedTextPreview: draft.sourceRawContent.slice(0, 12000),
    extractedCharCount: draft.sourceRawContent.length,
    fullTextAvailable: Boolean(draft.sourceRawContent),
    previewState: draft.sourceRawContent ? 'full_text_available' : 'no_text_available',
    sourceUrl: null,
    htmlUrl: null,
  }
}
