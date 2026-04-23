import { notFound } from 'next/navigation'
import Link from 'next/link'
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
  const moduleLearnHref = draft.sourceModuleId ? `/modules/${draft.sourceModuleId}/learn` : null
  const sourceResourceHref = draft.sourceModuleId && draft.sourceResourceId
    ? `/modules/${draft.sourceModuleId}/learn/resources/${encodeURIComponent(draft.sourceResourceId)}`
    : null
  const courseDraftsHref = courseId ? `/drafts?course=${encodeURIComponent(courseId)}` : '/drafts'

  const workspaceContent = (
    <div className="command-page command-page-tight">
      <section className="section-shell section-shell-elevated" style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.65rem' }}>
        <div>
          <p className="ui-kicker">Draft context</p>
          <h1 className="ui-page-title" style={{ marginTop: '0.45rem' }}>{draft.title}</h1>
          <p className="ui-page-copy" style={{ marginTop: '0.38rem', maxWidth: '48rem' }}>
            This draft belongs to {workspace?.module.title ?? 'a saved source'} and stays connected to its course/module workflow.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href={courseDraftsHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Draft library
          </Link>
          {moduleLearnHref && (
            <Link href={moduleLearnHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open Learn workspace
            </Link>
          )}
          {sourceResourceHref && (
            <Link href={sourceResourceHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Open source context
            </Link>
          )}
        </div>
      </section>
      <DeepLearnWorkspace
        moduleId={moduleId}
        courseId={courseId}
        resource={resource}
        deepLearnResourceId={draft.id}
        note={null}
        sourceHref={null}
        readerHref={moduleLearnHref ?? '/courses'}
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
    type: draft.sourceType === 'module_resource' ? 'learn resource' : draft.sourceType,
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
