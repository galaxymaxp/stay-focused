'use client'

import type { CSSProperties } from 'react'
import { useEffect } from 'react'
import Link from 'next/link'
import { buildDoNowPrompt } from '@/lib/do-now'
import type { DoNowContext } from '@/lib/do-now'

/**
 * Modal panel that answers four concrete questions to help the student start.
 * Receives a DoNowContext, derives the prompt text via buildDoNowPrompt, and
 * renders it. Closed via the backdrop click, Escape, or the close button.
 */
export function DoNowPanel({
  context,
  onClose,
}: {
  context: DoNowContext
  onClose: () => void
}) {
  const prompt = buildDoNowPrompt(context)

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <div
      className="motion-modal-backdrop"
      style={backdropStyle}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
      role="presentation"
    >
      <div
        className="glass-panel glass-strong motion-modal-card"
        style={cardStyle}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Do Now - ${context.taskTitle}`}
      >
        <div style={headerStyle}>
          <div style={{ minWidth: 0 }}>
            <p className="ui-kicker" style={{ margin: 0 }}>Do Now</p>
            <h2 style={titleStyle}>{context.taskTitle}</h2>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              <span className="ui-chip" style={courseChipStyle}>{context.courseName}</span>
              {context.moduleTitle && context.moduleTitle !== context.taskTitle && (
                <span className="ui-chip" style={moduleChipStyle}>{context.moduleTitle}</span>
              )}
              {context.priority && (
                <span className="ui-chip" style={priorityChipStyle(context.priority)}>
                  {context.priority} priority
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ui-button ui-button-ghost"
            aria-label="Close Do Now panel"
            style={closeButtonStyle}
          >
            X
          </button>
        </div>

        {prompt.urgencyNote && (
          <div className="ui-chip" style={urgencyNoticeStyle}>
            {prompt.urgencyNote}
          </div>
        )}

        <div style={sectionsStyle}>
          <PromptSection
            number={1}
            question="What should I do first?"
            answer={prompt.whatFirst}
          />
          <PromptSection
            number={2}
            question="What am I trying to produce?"
            answer={prompt.whatToProduce}
          />
          <PromptSection
            number={3}
            question="Where do I start right now?"
            answer={prompt.whereToStart}
          />
          <PromptSection
            number={4}
            question="What is the smallest meaningful next step?"
            answer={prompt.smallestStep}
          />
        </div>

        <div style={footerStyle}>
          {context.canvasUrl && (
            <a
              href={context.canvasUrl}
              target="_blank"
              rel="noreferrer"
              className="ui-button ui-button-primary"
              style={footerButtonStyle}
            >
              Open in Canvas
            </a>
          )}
          {context.learnHref && (
            <Link
              href={context.learnHref}
              className="ui-button ui-button-secondary"
              style={footerButtonStyle}
              onClick={onClose}
            >
              Open Learn
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ui-button ui-button-ghost"
            style={footerButtonStyle}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function PromptSection({
  number,
  question,
  answer,
}: {
  number: number
  question: string
  answer: string
}) {
  return (
    <div style={sectionRowStyle}>
      <div style={sectionNumberStyle}>{number}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={questionStyle}>{question}</p>
        <p style={answerStyle}>{answer}</p>
      </div>
    </div>
  )
}

function priorityChipStyle(priority: 'high' | 'medium' | 'low'): CSSProperties {
  if (priority === 'high') {
    return {
      padding: '0.22rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--amber-light) 44%, var(--surface-soft) 56%)',
      color: 'var(--amber)',
      border: '1px solid color-mix(in srgb, var(--amber) 26%, var(--border-subtle) 74%)',
    }
  }
  if (priority === 'medium') {
    return {
      padding: '0.22rem 0.55rem',
      fontSize: '11px',
      fontWeight: 700,
      background: 'color-mix(in srgb, var(--accent-light) 46%, var(--surface-soft) 54%)',
      color: 'var(--accent-foreground)',
      border: '1px solid color-mix(in srgb, var(--accent-border) 32%, var(--border-subtle) 68%)',
    }
  }
  return {
    padding: '0.22rem 0.55rem',
    fontSize: '11px',
    fontWeight: 700,
    background: 'color-mix(in srgb, var(--surface-soft) 92%, transparent)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  }
}

const backdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  background: 'color-mix(in srgb, rgba(15, 12, 10, 0.54) 100%, transparent)',
  backdropFilter: 'blur(6px)',
  WebkitBackdropFilter: 'blur(6px)',
}

const cardStyle: CSSProperties = {
  width: '100%',
  maxWidth: '620px',
  maxHeight: 'calc(100dvh - 2rem)',
  overflowY: 'auto',
  borderRadius: 'var(--radius-page)',
  padding: '1.35rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  alignItems: 'flex-start',
}

const titleStyle: CSSProperties = {
  margin: '0.4rem 0 0',
  fontSize: '22px',
  lineHeight: 1.1,
  fontWeight: 650,
  letterSpacing: '-0.03em',
  color: 'var(--text-primary)',
}

const courseChipStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-secondary)',
}

const moduleChipStyle: CSSProperties = {
  padding: '0.22rem 0.6rem',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--text-muted)',
}

const closeButtonStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: '2.2rem',
  width: '2.2rem',
  padding: 0,
  fontSize: '13px',
  borderRadius: 'var(--radius-control)',
}

const urgencyNoticeStyle: CSSProperties = {
  display: 'block',
  padding: '0.65rem 0.85rem',
  borderRadius: 'var(--radius-panel)',
  fontSize: '13px',
  lineHeight: 1.6,
  fontWeight: 500,
  background: 'color-mix(in srgb, var(--amber-light) 48%, var(--surface-soft) 52%)',
  color: 'var(--amber)',
  border: '1px solid color-mix(in srgb, var(--amber) 22%, var(--border-subtle) 78%)',
}

const sectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0',
  borderRadius: 'var(--radius-panel)',
  border: '1px solid var(--border-subtle)',
  overflow: 'hidden',
}

const sectionRowStyle: CSSProperties = {
  display: 'flex',
  gap: '0.85rem',
  padding: '0.9rem 0.95rem',
  borderBottom: '1px solid var(--border-subtle)',
  background: 'var(--surface-base)',
}

const sectionNumberStyle: CSSProperties = {
  width: '1.55rem',
  height: '1.55rem',
  borderRadius: '999px',
  background: 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)',
  border: '1px solid color-mix(in srgb, var(--accent-border) 30%, var(--border-subtle) 70%)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: 700,
  color: 'var(--text-primary)',
  flexShrink: 0,
  marginTop: '0.12rem',
}

const questionStyle: CSSProperties = {
  margin: 0,
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const answerStyle: CSSProperties = {
  margin: '0.38rem 0 0',
  fontSize: '14px',
  lineHeight: 1.68,
  color: 'var(--text-primary)',
}

const footerStyle: CSSProperties = {
  display: 'flex',
  gap: '0.55rem',
  flexWrap: 'wrap',
  paddingTop: '0.1rem',
}

const footerButtonStyle: CSSProperties = {
  minHeight: '2.35rem',
  padding: '0.58rem 0.9rem',
  fontSize: '13px',
}
