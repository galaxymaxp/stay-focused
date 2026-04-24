import Link from 'next/link'
import { getDeepLearnNoteById, getDraft } from '@/actions/drafts'
import { DeepLearnWorkspace } from '@/components/DeepLearnWorkspace'
import { GeneratedContentState } from '@/components/generated-content/GeneratedContentState'
import { ModuleLensShell } from '@/components/ModuleLensShell'
import { getAuthenticatedUserServer } from '@/lib/auth-server'
import { extractCourseName, getModuleWorkspace, type ModuleSourceResource } from '@/lib/module-workspace'
import {
  buildModuleDoHref,
  buildModuleLearnHref,
} from '@/lib/stay-focused-links'
import { isSupabaseAuthConfigured } from '@/lib/supabase-auth-config'
import {
  buildStudyLibraryDetailHref,
  getTaskIdFromCanonicalSourceId,
  parseCanonicalSourceId,
} from '@/lib/types'

interface Props {
  params: Promise<{ id: string }>
}

interface LibraryPrimaryAction {
  href: string | null
  label: 'Open Tasks workspace' | 'Open Learn workspace' | 'Open source workspace' | 'Open saved item'
  note: string | null
}

export default async function LibraryItemPage({ params }: Props) {
  const { id } = await params
  const detailHref = buildStudyLibraryDetailHref(id)
  const user = await getAuthenticatedUserServer()

  if (!isSupabaseAuthConfigured) {
    return (
      <main className="page-shell">
        <GeneratedContentState
          title="Saved study content is not available here yet."
          description="This local setup does not have saved Library items configured."
          tone="warning"
          action={(
            <Link href="/courses" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Go to Courses
            </Link>
          )}
        />
      </main>
    )
  }

  if (!user) {
    return (
      <main className="page-shell">
        <GeneratedContentState
          title="Sign in to load your saved study content."
          description="Your saved notes, task drafts, and exam prep packs will appear here after you sign in."
          tone="accent"
          action={(
            <Link href={`/sign-in?next=${encodeURIComponent(detailHref)}`} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Sign in
            </Link>
          )}
        />
      </main>
    )
  }

  const note = await getDeepLearnNoteById(id)

  if (note) {
    const workspace = await getModuleWorkspace(note.moduleId)
    const resource = buildNoteResource(note, workspace?.module.title ?? null)
    const courseId = workspace?.module.courseId ?? note.courseId ?? null
    const courseName = extractCourseName(workspace?.module.raw_content)
    const courseLibraryHref = courseId ? `/library?course=${encodeURIComponent(courseId)}` : '/library'
    const learnWorkspaceHref = workspace ? buildModuleLearnHref(note.moduleId) : null
    const sourceWorkspaceHref = workspace ? buildLearnResourceWorkspaceHref(note.moduleId, note.resourceId) : null
    const primaryAction = resolveNotePrimaryAction(learnWorkspaceHref, sourceWorkspaceHref)

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
            {primaryAction.href ? (
              <Link href={primaryAction.href} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
                {primaryAction.label}
              </Link>
            ) : (
              <span className="ui-button ui-button-ghost ui-button-xs" aria-disabled="true" style={{ opacity: 0.72, cursor: 'default' }}>
                {primaryAction.label}
              </span>
            )}
            {sourceWorkspaceHref && sourceWorkspaceHref !== primaryAction.href && (
              <Link href={sourceWorkspaceHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
                Open source workspace
              </Link>
            )}
          </div>
          {primaryAction.note && (
            <GeneratedContentState
              title="This saved item is still available, but its original source could not be reopened."
              description="You can still use the saved content below."
              tone="warning"
            />
          )}
        </section>
        <DeepLearnWorkspace
          moduleId={note.moduleId}
          courseId={courseId}
          resource={resource}
          deepLearnResourceId={note.resourceId}
          note={note}
          sourceHref={resource.sourceUrl ?? resource.htmlUrl ?? null}
          readerHref={primaryAction.href ?? detailHref}
          readerLabel={primaryAction.label}
          blockedMessage={primaryAction.note}
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
  if (!draft) {
    return (
      <main className="page-shell">
        <GeneratedContentState
          title="This saved item is no longer available."
          description="It may have been removed, or the link no longer points to a saved Library item."
          tone="warning"
          action={(
            <Link href="/library" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Back to Library
            </Link>
          )}
        />
      </main>
    )
  }

  const isTaskDraft = draft.sourceType === 'task'
  const workspace = draft.sourceModuleId ? await getModuleWorkspace(draft.sourceModuleId) : null
  const moduleId = draft.sourceModuleId ?? draft.id
  const courseId = workspace?.module.courseId ?? draft.courseId ?? null
  const courseName = extractCourseName(workspace?.module.raw_content)
  const resource = buildDraftResource(draft, workspace?.module.title ?? null)
  const detailAction = resolveDraftPrimaryAction(draft, Boolean(workspace))
  const sourceWorkspaceHref = !isTaskDraft && workspace && draft.sourceModuleId && draft.sourceResourceId
    ? buildLearnResourceWorkspaceHref(draft.sourceModuleId, draft.sourceResourceId)
    : null
  const courseLibraryHref = courseId ? `/library?course=${encodeURIComponent(courseId)}` : '/library'
  const sourceHref = isTaskDraft ? draft.sourceFilePath : null

  const workspaceContent = (
    <div className="command-page command-page-tight">
      <section className="section-shell section-shell-elevated" style={{ padding: '0.9rem 1rem', display: 'grid', gap: '0.65rem' }}>
        <div>
          <p className="ui-kicker">Study Library</p>
          <h1 className="ui-page-title" style={{ marginTop: '0.45rem' }}>{draft.title}</h1>
          <p className="ui-page-copy" style={{ marginTop: '0.38rem', maxWidth: '48rem' }}>
            {isTaskDraft
              ? `This saved task draft stays connected to ${workspace?.module.title ?? 'its module'} so you can jump back into the Do workflow with the source context nearby.`
              : `This saved study output belongs to ${workspace?.module.title ?? 'a saved source'} and stays connected to its course and module workflow.`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <Link href={courseLibraryHref} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
            Study Library
          </Link>
          {detailAction.href ? (
            <Link href={detailAction.href} className="ui-button ui-button-ghost ui-button-xs" style={{ textDecoration: 'none' }}>
              {detailAction.label}
            </Link>
          ) : (
            <span className="ui-button ui-button-ghost ui-button-xs" aria-disabled="true" style={{ opacity: 0.72, cursor: 'default' }}>
              {detailAction.label}
            </span>
          )}
          {sourceWorkspaceHref && sourceWorkspaceHref !== detailAction.href && (
            <Link href={sourceWorkspaceHref} className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Open source workspace
            </Link>
          )}
          {sourceHref && (
            <a href={sourceHref} target="_blank" rel="noreferrer" className="ui-button ui-button-secondary ui-button-xs" style={{ textDecoration: 'none' }}>
              Open task source
            </a>
          )}
        </div>
        {detailAction.note && (
          <GeneratedContentState
            title="This saved item is still available, but its original source could not be reopened."
            description="You can still use the saved content below."
            tone="warning"
          />
        )}
      </section>
      <DeepLearnWorkspace
        moduleId={moduleId}
        courseId={courseId}
        resource={resource}
        deepLearnResourceId={draft.id}
        note={null}
        sourceHref={sourceHref}
        readerHref={detailAction.href ?? detailHref}
        readerLabel={detailAction.label}
        blockedMessage={detailAction.note}
        statusSummary={isTaskDraft
          ? 'This saved task draft resumes as a standalone working document while keeping its Do workspace one click away.'
          : 'This saved study output predates the pack-first Learn flow, so it resumes as a standalone document with its source context.'}
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
    sourceUrl: draft.sourceFilePath,
    htmlUrl: null,
  }
}

function resolveNotePrimaryAction(
  learnWorkspaceHref: string | null,
  sourceWorkspaceHref: string | null,
): LibraryPrimaryAction {
  if (learnWorkspaceHref) {
    return {
      href: learnWorkspaceHref,
      label: 'Open Learn workspace',
      note: null,
    }
  }

  if (sourceWorkspaceHref) {
    return {
      href: sourceWorkspaceHref,
      label: 'Open source workspace',
      note: null,
    }
  }

  return {
    href: null,
    label: 'Open saved item',
    note: 'This saved item stays available here because its source workspace is no longer linked.',
  }
}

function resolveDraftPrimaryAction(
  draft: NonNullable<Awaited<ReturnType<typeof getDraft>>>,
  hasWorkspace: boolean,
): LibraryPrimaryAction {
  if (draft.sourceType === 'task') {
    if (!draft.sourceModuleId || !hasWorkspace) {
      return {
        href: null,
        label: 'Open saved item',
        note: 'This saved task draft stays available here because its task workspace can no longer be resolved.',
      }
    }

    const taskId = getTaskIdFromCanonicalSourceId(draft.canonicalSourceId)
    if (taskId) {
      return {
        href: buildModuleDoHref(draft.sourceModuleId, { taskId }),
        label: 'Open Tasks workspace',
        note: null,
      }
    }

    const canonicalReference = parseCanonicalSourceId(draft.canonicalSourceId)
    const exactTaskNote = canonicalReference.prefix
      ? 'This saved task draft can still reopen the module task workspace, but its exact task link is unavailable.'
      : 'This saved task draft predates stable task IDs, so it reopens at the module task workspace instead of a specific task.'

    return {
      href: buildModuleDoHref(draft.sourceModuleId),
      label: 'Open Tasks workspace',
      note: exactTaskNote,
    }
  }

  if (draft.sourceModuleId && hasWorkspace) {
    return {
      href: buildModuleLearnHref(draft.sourceModuleId),
      label: 'Open Learn workspace',
      note: null,
    }
  }

  return {
    href: null,
    label: 'Open saved item',
    note: 'This saved item stays available here because its source workspace is no longer linked.',
  }
}

function buildLearnResourceWorkspaceHref(moduleId: string, resourceId: string) {
  return `/modules/${moduleId}/learn/resources/${encodeURIComponent(resourceId)}`
}
