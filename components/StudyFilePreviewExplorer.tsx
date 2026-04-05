'use client'

import { useDeferredValue, useEffect, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactNode } from 'react'
import type { StudyFilePreviewBlock } from '@/lib/study-file-reader'

interface PreviewSectionWithMatches {
  block: StudyFilePreviewBlock
  matches: Array<{ start: number; end: number }>
  matchStartIndex: number
}

export function StudyFilePreviewExplorer({ previewBlocks }: { previewBlocks: StudyFilePreviewBlock[] }) {
  const [query, setQuery] = useState('')
  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const deferredQuery = useDeferredValue(query.trim())
  const matchRefs = useRef<Array<HTMLElement | null>>([])
  const previewSections = buildPreviewSections(previewBlocks, deferredQuery)
  const totalMatches = previewSections.reduce((sum, section) => sum + section.matches.length, 0)
  const activeSearch = deferredQuery.length > 0
  const activeSectionId = activeSearch && totalMatches > 0
    ? previewSections.find((section) => (
      activeMatchIndex >= section.matchStartIndex
      && activeMatchIndex < section.matchStartIndex + section.matches.length
    ))?.block.id ?? null
    : null

  useEffect(() => {
    setActiveMatchIndex(0)
  }, [deferredQuery])

  useEffect(() => {
    if (totalMatches === 0) {
      if (activeMatchIndex !== 0) {
        setActiveMatchIndex(0)
      }
      return
    }

    if (activeMatchIndex > totalMatches - 1) {
      setActiveMatchIndex(totalMatches - 1)
    }
  }, [activeMatchIndex, totalMatches])

  useEffect(() => {
    matchRefs.current = matchRefs.current.slice(0, totalMatches)
  }, [totalMatches])

  useEffect(() => {
    if (!activeSearch || totalMatches === 0) return
    const activeNode = matchRefs.current[activeMatchIndex]
    activeNode?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
  }, [activeMatchIndex, activeSearch, totalMatches])

  const searchMessage = !activeSearch
    ? 'Search stays local to this extracted preview so you can scan the source without leaving the page.'
    : totalMatches === 0
      ? 'No matches were found in this preview.'
      : totalMatches === 1
        ? '1 match found in this preview.'
        : `${totalMatches} matches found in this preview.`

  function stepToMatch(direction: -1 | 1) {
    if (totalMatches === 0) return

    setActiveMatchIndex((current) => {
      const next = current + direction
      if (next < 0) return totalMatches - 1
      if (next >= totalMatches) return 0
      return next
    })
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || totalMatches === 0) return
    event.preventDefault()
    stepToMatch(event.shiftKey ? -1 : 1)
  }

  return (
    <div style={{ display: 'grid', gap: '0.85rem' }}>
      <div className="glass-panel glass-soft" style={{
        borderRadius: 'var(--radius-panel)',
        padding: '0.95rem 1rem',
        display: 'grid',
        gap: '0.85rem',
      }}>
        <div style={{ display: 'flex', gap: '0.85rem', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={{ display: 'grid', gap: '0.45rem', flex: '1 1 280px' }}>
            <span className="ui-kicker">Search the preview</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="ui-input"
              placeholder="Find a term in this extracted preview"
              autoComplete="off"
              spellCheck={false}
              style={{ padding: '0.75rem 0.9rem', fontSize: '14px' }}
            />
          </label>

          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => stepToMatch(-1)}
              disabled={totalMatches === 0}
              className={`ui-button ${totalMatches > 0 ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => stepToMatch(1)}
              disabled={totalMatches === 0}
              className={`ui-button ${totalMatches > 0 ? 'ui-button-secondary' : 'ui-button-ghost'} ui-button-xs`}
            >
              Next
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <p aria-live="polite" style={{ margin: 0, fontSize: '13px', lineHeight: 1.65, color: 'var(--text-secondary)' }}>
            {searchMessage}
          </p>
          {activeSearch && totalMatches > 0 && (
            <span className="ui-chip ui-chip-soft ui-chip-selected" style={{ padding: '0.34rem 0.7rem', fontSize: '11px', fontWeight: 700 }}>
              Match {activeMatchIndex + 1} of {totalMatches}
            </span>
          )}
        </div>

        {previewBlocks.length > 1 && (
          <nav aria-label="Preview section navigation" style={{ display: 'grid', gap: '0.45rem' }}>
            <p className="ui-kicker">Jump to section</p>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              {previewBlocks.map((block) => (
                <a
                  key={block.id}
                  href={`#${block.id}`}
                  className={`ui-chip ui-chip-soft${activeSectionId === block.id ? ' ui-chip-selected' : ''}`}
                  style={{ padding: '0.38rem 0.72rem', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}
                >
                  {block.title}
                </a>
              ))}
            </div>
          </nav>
        )}
      </div>

      <div style={{ display: 'grid', gap: '0.85rem' }}>
        {previewSections.map((section) => (
          <article
            key={section.block.id}
            id={section.block.id}
            className="glass-panel glass-soft"
            style={{
              ['--glass-panel-bg' as string]: activeSectionId === section.block.id
                ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
                : 'var(--glass-surface-soft)',
              ['--glass-panel-border' as string]: activeSectionId === section.block.id
                ? 'color-mix(in srgb, var(--accent-border) 54%, var(--border-subtle) 46%)'
                : 'var(--glass-border)',
              ['--glass-panel-shadow' as string]: activeSectionId === section.block.id
                ? 'var(--glass-shadow-strong)'
                : 'var(--glass-shadow)',
              borderRadius: 'var(--radius-panel)',
              padding: '1rem 1.05rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.62rem',
              scrollMarginTop: '6.25rem',
            }}
          >
            <p className="ui-kicker" style={{ margin: 0 }}>{section.block.title}</p>
            <p className="ui-reading-copy" style={{ margin: 0, fontSize: '15px', lineHeight: 1.82, color: 'var(--text-secondary)' }}>
              {renderHighlightedText({
                text: section.block.body,
                matches: section.matches,
                matchStartIndex: section.matchStartIndex,
                activeMatchIndex,
                matchRefs,
              })}
            </p>
          </article>
        ))}
      </div>
    </div>
  )
}

function buildPreviewSections(previewBlocks: StudyFilePreviewBlock[], query: string): PreviewSectionWithMatches[] {
  let matchStartIndex = 0

  return previewBlocks.map((block) => {
    const matches = findMatchRanges(block.body, query)
    const section = {
      block,
      matches,
      matchStartIndex,
    }

    matchStartIndex += matches.length
    return section
  })
}

function findMatchRanges(text: string, query: string) {
  if (!query) return []

  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  const matches: Array<{ start: number; end: number }> = []
  let startIndex = 0

  while (startIndex <= normalizedText.length - normalizedQuery.length) {
    const matchIndex = normalizedText.indexOf(normalizedQuery, startIndex)
    if (matchIndex === -1) break

    matches.push({
      start: matchIndex,
      end: matchIndex + query.length,
    })

    startIndex = matchIndex + normalizedQuery.length
  }

  return matches
}

function renderHighlightedText({
  text,
  matches,
  matchStartIndex,
  activeMatchIndex,
  matchRefs,
}: {
  text: string
  matches: Array<{ start: number; end: number }>
  matchStartIndex: number
  activeMatchIndex: number
  matchRefs: MutableRefObject<Array<HTMLElement | null>>
}): ReactNode {
  if (matches.length === 0) {
    return text
  }

  const parts: ReactNode[] = []
  let cursor = 0

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]
    const globalMatchIndex = matchStartIndex + index

    if (cursor < match.start) {
      parts.push(text.slice(cursor, match.start))
    }

    parts.push(
      <mark
        key={`${globalMatchIndex}-${match.start}`}
        ref={(node) => {
          matchRefs.current[globalMatchIndex] = node
        }}
        style={{
          background: globalMatchIndex === activeMatchIndex
            ? 'color-mix(in srgb, var(--accent-light) 84%, var(--surface-elevated) 16%)'
            : 'color-mix(in srgb, var(--amber-light) 82%, var(--surface-elevated) 18%)',
          color: 'var(--text-primary)',
          borderRadius: '0.4rem',
          padding: '0.04rem 0.16rem',
          boxShadow: globalMatchIndex === activeMatchIndex
            ? '0 0 0 1px color-mix(in srgb, var(--accent-border) 42%, transparent)'
            : 'none',
        }}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    )

    cursor = match.end
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor))
  }

  return parts
}
