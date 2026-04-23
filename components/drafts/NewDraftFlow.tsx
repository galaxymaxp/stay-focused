'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BookOpen, FileText, ClipboardList, Layers, Hash } from 'lucide-react'
import { cn } from '@/lib/cn'
import { createDraft } from '@/actions/drafts'
import { DRAFT_TYPE_LABELS, DRAFT_TYPE_DESCRIPTIONS } from '@/lib/prompts/drafts/index'
import type { DraftType } from '@/lib/types'

type ModuleOption = {
  id: string
  title: string
  courseTitle?: string
}

type Props = {
  modules: ModuleOption[]
  initialModuleId?: string | null
}

const DRAFT_TYPES: DraftType[] = ['exam_reviewer', 'study_notes', 'summary', 'flashcard_set']

const typeIcons = {
  exam_reviewer: ClipboardList,
  study_notes: FileText,
  summary: Layers,
  flashcard_set: BookOpen,
}

const typeColors = {
  exam_reviewer: 'border-sf-accent bg-sf-accent-light text-sf-accent',
  study_notes: 'border-sf-success bg-sf-success-bg text-sf-success',
  summary: 'border-[#E8824B] bg-orange-50 text-[#E8824B]',
  flashcard_set: 'border-[#E84B9E] bg-pink-50 text-[#E84B9E]',
}

export function NewDraftFlow({ modules, initialModuleId = null }: Props) {
  const [sourceMode, setSourceMode] = useState<'module' | 'paste'>('module')
  const [selectedModuleId, setSelectedModuleId] = useState<string>(() => {
    if (!initialModuleId) return ''
    return modules.some((module) => module.id === initialModuleId) ? initialModuleId : ''
  })
  const [pasteContent, setPasteContent] = useState('')
  const [pasteTitle, setPasteTitle] = useState('')
  const [selectedType, setSelectedType] = useState<DraftType>('exam_reviewer')
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit =
    selectedType &&
    (sourceMode === 'module' ? Boolean(selectedModuleId) : Boolean(pasteContent.trim()))

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!canSubmit) return

    setIsPending(true)
    setError(null)

    const fd = new FormData()
    fd.set('draft_type', selectedType)
    fd.set('source_type', sourceMode)

    if (sourceMode === 'module') {
      fd.set('module_id', selectedModuleId)
    } else {
      fd.set('paste_content', pasteContent)
      fd.set('paste_title', pasteTitle || 'Pasted Content')
    }

    try {
      await createDraft(fd)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setIsPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-6 py-10 lg:py-14 space-y-10">
      <div>
        <h1 className="text-xl font-semibold text-sf-text mb-1">New Draft Notebook Entry</h1>
        <p className="text-sm text-sf-muted">Create a saved notebook draft tied to course/module material so you can continue it from Learn and Do.</p>
      </div>

      {/* Step 1: Source */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle mb-4">
          1 — Source Material
        </h2>

        {/* Source mode toggle */}
        <div className="flex rounded-xl border border-sf-border bg-sf-surface-2 p-1 mb-5 w-fit">
          <button
            type="button"
            onClick={() => setSourceMode('module')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              sourceMode === 'module'
                ? 'bg-sf-surface text-sf-text shadow-sm'
                : 'text-sf-muted hover:text-sf-text',
            )}
          >
            Canvas Module
          </button>
          <button
            type="button"
            onClick={() => setSourceMode('paste')}
            className={cn(
              'rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
              sourceMode === 'paste'
                ? 'bg-sf-surface text-sf-text shadow-sm'
                : 'text-sf-muted hover:text-sf-text',
            )}
          >
            Paste Content
          </button>
        </div>

        {sourceMode === 'module' ? (
          <div className="space-y-2">
            {modules.length === 0 ? (
              <div className="rounded-xl border border-sf-border bg-sf-surface-2 p-6 text-center">
                <p className="text-sm text-sf-muted">No modules synced yet.</p>
                <p className="text-xs text-sf-subtle mt-1">Sync a Canvas course first, then come back.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-sf-border bg-sf-surface overflow-hidden divide-y divide-sf-border max-h-72 overflow-y-auto">
                {modules.map((mod) => (
                  <label
                    key={mod.id}
                    className={cn(
                      'flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-sf-surface-2 transition-colors',
                      selectedModuleId === mod.id && 'bg-sf-accent-light',
                    )}
                  >
                    <input
                      type="radio"
                      name="module_id"
                      value={mod.id}
                      checked={selectedModuleId === mod.id}
                      onChange={() => setSelectedModuleId(mod.id)}
                      className="accent-sf-accent"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-sf-text truncate">{mod.title}</p>
                      {mod.courseTitle && (
                        <p className="text-xs text-sf-muted truncate">{mod.courseTitle}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="text"
              placeholder="Source title (optional)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
              className="w-full rounded-xl border border-sf-border bg-sf-surface px-4 py-2.5 text-sm text-sf-text placeholder:text-sf-muted focus:outline-none focus:border-sf-accent transition-colors"
            />
            <textarea
              placeholder="Paste your study material here — lecture notes, textbook sections, slides content, syllabus…"
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              rows={10}
              className="w-full resize-none rounded-xl border border-sf-border bg-sf-surface px-4 py-3 text-sm text-sf-text placeholder:text-sf-muted focus:outline-none focus:border-sf-accent transition-colors font-mono leading-relaxed"
            />
            {pasteContent && (
              <p className="text-xs text-sf-muted text-right">
                {pasteContent.length.toLocaleString()} characters
              </p>
            )}
          </div>
        )}
      </section>

      {/* Step 2: Draft type */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-sf-subtle mb-4">
          2 — Draft Type
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {DRAFT_TYPES.map((type) => {
            const Icon = typeIcons[type]
            const isSelected = selectedType === type
            return (
              <label
                key={type}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-all',
                  isSelected
                    ? typeColors[type]
                    : 'border-sf-border bg-sf-surface hover:border-sf-accent/40 hover:bg-sf-surface-2',
                )}
              >
                <input
                  type="radio"
                  name="draft_type"
                  value={type}
                  checked={isSelected}
                  onChange={() => setSelectedType(type)}
                  className="sr-only"
                />
                <Icon className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className={cn('text-sm font-semibold', isSelected ? 'inherit' : 'text-sf-text')}>
                    {DRAFT_TYPE_LABELS[type]}
                  </p>
                  <p className={cn('text-xs mt-0.5 leading-relaxed', isSelected ? 'opacity-80' : 'text-sf-muted')}>
                    {DRAFT_TYPE_DESCRIPTIONS[type]}
                  </p>
                </div>
              </label>
            )
          })}
        </div>
      </section>

      {/* Error */}
      {error && (
        <p className="text-sm text-sf-error bg-sf-error-bg rounded-xl px-4 py-3">{error}</p>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between pt-2">
        <Link href="/courses" className="text-sm text-sf-muted hover:text-sf-text transition-colors">
          Cancel
        </Link>
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-sf-accent px-6 py-2.5 text-sm font-semibold text-white hover:bg-sf-accent-hover disabled:opacity-50 transition-colors"
        >
          {isPending ? (
            <>
              <Hash className="h-4 w-4 animate-spin" />
              Generating…
            </>
          ) : (
            'Generate Draft'
          )}
        </button>
      </div>

      {isPending && (
        <p className="text-xs text-sf-muted text-center -mt-4">
          Generation takes 20–60 seconds. You&apos;ll land in the workspace when ready.
        </p>
      )}
    </form>
  )
}
