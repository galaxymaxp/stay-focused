import { notFound } from 'next/navigation'
import Link from 'next/link'
import { DeepLearnWorkspace } from '@/components/DeepLearnWorkspace'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { getDeepLearnNoteById, getDraft } from '@/actions/drafts'
import { extractCourseName, getModuleWorkspace, type ModuleSourceResource } from '@/lib/module-workspace'

interface Props {
  params: Promise<{ id: string }>
}

export default async function LibraryItemPage({ params }: Props) {
  const { id } = await params
  const note = await getDeepLearnNoteById(id)

  if (note) {
    const workspace = await getModuleWorkspace(note.moduleId)
    const resource = buildNoteResource(note, workspace?.module.title ?? null)
    const courseId = workspace?.module.courseId ?? note.courseId ?? null
    const courseName = extractCourseName(workspace?.module.raw_content)
    const moduleLearnHref = `/modules/${note.moduleId}/learn`
    const sourceResourceHref = `/modules/${note.moduleId}/learn/resources/${encodeURIComponent(note.resourceId)}`
    const courseLibraryHref = courseId ? `/library?course=${encodeURIComponent(courseId)}` : '/library'

    const workspaceContent = (
      <div className="command-page command-page-tight">
        <section className="section-shell section-shell-elevated" style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.65rem' }}>
          <div>
            <p className="ui-kicker">Study Library</p>
            <h1 className="ui-page-title" style={{ marginTop: '0.45rem' }}>{note.title}</h1>
            <p className="ui-page-copy" style={{ marginTop: '0.38rem', maxWidth: '48rem' }}>
              This saved exam prep pack stays tied to its course, module, canonical source, and review surface.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <Link href={courseLibraryHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Study Library
            </Link>
            <Link href={moduleLearnHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              Open Learn workspace
            </Link>
            <Link href={sourceResourceHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Open source context
            </Link>
          </div>
        </section>
        <DeepLearnWorkspace
          moduleId={note.moduleId}
          courseId={courseId}
          resource={resource}
          deepLearnResourceId={note.resourceId}
          note={note}
          sourceHref={resource.sourceUrl ?? resource.htmlUrl ?? null}
          readerHref={sourceResourceHref}
          statusSummary="This saved exam prep pack reopens the same Deep Learn review surface with its pinned source beside it."
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
        summary={note.title}
      >
        {workspaceContent}
      </ModuleLensShell>
    )
  }

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
  const courseLibraryHref = courseId ? `/library?course=${encodeURIComponent(courseId)}` : '/library'

  const workspaceContent = (
    <div className="command-page command-page-tight">
      <section className="section-shell section-shell-elevated" style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.65rem' }}>
        <div>
          <p className="ui-kicker">Study Library</p>
          <h1 className="ui-page-title" style={{ marginTop: '0.45rem' }}>{draft.title}</h1>
          <p className="ui-page-copy" style={{ marginTop: '0.38rem', maxWidth: '48rem' }}>
            This saved study output belongs to {workspace?.module.title ?? 'a saved source'} and stays connected to its course and module workflow.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href={courseLibraryHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Study Library
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
        statusSummary="This saved study output predates the pack-first Learn flow, so it resumes as a standalone document with its source context."
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

function buildNoteResource(
  note: NonNullable<Awaited<ReturnType<typeof getDeepLearnNoteById>>>,
  moduleName: string | null,
): ModuleSourceResource {
  return {
    id: note.resourceId,
    title: note.title,
    type: note.sourceGrounding.sourceType ?? 'learn resource',
    required: false,
    moduleName,
    category: 'resource',
    kind: 'reference',
    lane: 'learn',
    extractedText: note.noteBody,
    extractedTextPreview: note.noteBody.slice(0, 12000),
    extractedCharCount: note.noteBody.length,
    fullTextAvailable: Boolean(note.noteBody),
    previewState: note.noteBody ? 'full_text_available' : 'no_text_available',
    sourceUrl: null,
    htmlUrl: null,
  }
}

function buildDraftResource(
  draft: NonNullable<Awaited<ReturnType<typeof getDraft>>>,
  moduleName: string | null,
): ModuleSourceResource {
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
