'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertTriangle, ChevronDown } from 'lucide-react'
import { removeCourseAction } from '@/actions/courses'
import { dispatchInAppToast } from '@/lib/notifications'

interface CourseEntry {
  id: string
  name: string
  code: string
}

export function CourseDangerZone({ courses }: { courses: CourseEntry[] }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  if (courses.length === 0) return null

  async function handleConfirmDelete(courseId: string, courseName: string) {
    setDeletingId(courseId)
    setConfirmId(null)
    try {
      const result = await removeCourseAction(courseId)
      if (result.ok) {
        dispatchInAppToast({
          title: 'Course removed',
          description: `"${courseName}" was removed from Stay Focused.`,
          tone: 'info',
        })
        router.refresh()
      } else {
        dispatchInAppToast({
          title: 'Could not remove course',
          description: result.error ?? 'Try again.',
          tone: 'error',
        })
      }
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section
      style={{
        borderRadius: 'var(--radius-panel)',
        border: '1px solid color-mix(in srgb, var(--red) 22%, var(--border-subtle) 78%)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.72rem 0.9rem',
          background: expanded
            ? 'color-mix(in srgb, var(--red) 6%, var(--surface-base) 94%)'
            : 'color-mix(in srgb, var(--surface-soft) 60%, transparent)',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <AlertTriangle style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0, color: 'color-mix(in srgb, var(--red) 70%, var(--text-muted) 30%)' }} />
        <span style={{ flex: 1, fontSize: '13px', fontWeight: 600, color: 'color-mix(in srgb, var(--red) 70%, var(--text-primary) 30%)' }}>
          Danger zone
        </span>
        <ChevronDown
          style={{
            width: '0.85rem',
            height: '0.85rem',
            color: 'var(--text-muted)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.12s ease',
          }}
        />
      </button>

      {expanded && (
        <div style={{ padding: '0.6rem 0.9rem 0.9rem', display: 'grid', gap: '0.5rem' }}>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>
            Removing a course deletes all synced data for that course from Stay Focused — modules, tasks, resources, and generated content. This does not affect Canvas.
          </p>

          <div style={{ display: 'grid', gap: '0.35rem', marginTop: '0.2rem' }}>
            {courses.map((course) => (
              <div
                key={course.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: 'var(--radius-tight)',
                  background: 'color-mix(in srgb, var(--surface-elevated) 92%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--border-subtle) 70%, transparent)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {course.name}
                  </p>
                  {course.code && (
                    <p style={{ margin: 0, fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                      {course.code}
                    </p>
                  )}
                </div>

                {confirmId === course.id ? (
                  <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => handleConfirmDelete(course.id, course.name)}
                      disabled={deletingId === course.id}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 600,
                        borderRadius: 'var(--radius-control)',
                        background: 'var(--red)',
                        color: '#fff',
                        border: 'none',
                        cursor: 'pointer',
                        opacity: deletingId === course.id ? 0.65 : 1,
                      }}
                    >
                      {deletingId === course.id ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="ui-button ui-button-ghost"
                      style={{ padding: '4px 10px', fontSize: '12px' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(course.id)}
                    disabled={deletingId !== null}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '4px 10px',
                      fontSize: '12px',
                      fontWeight: 500,
                      borderRadius: 'var(--radius-control)',
                      border: '1px solid color-mix(in srgb, var(--red) 40%, var(--border-subtle) 60%)',
                      background: 'transparent',
                      color: 'color-mix(in srgb, var(--red) 70%, var(--text-muted) 30%)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      opacity: deletingId !== null ? 0.5 : 1,
                    }}
                  >
                    <Trash2 style={{ width: '0.8rem', height: '0.8rem' }} />
                    Remove course
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
