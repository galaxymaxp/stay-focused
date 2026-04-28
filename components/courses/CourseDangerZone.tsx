'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Trash2, Loader2 } from 'lucide-react'
import { removeCourseAction } from '@/actions/courses'
import { dispatchInAppToast } from '@/lib/notifications'
import { cn } from '@/lib/cn'

interface CourseEntry {
  id: string
  name: string
  code: string
}

interface Props {
  courses: CourseEntry[]
}

function CourseRemoveRow({ course }: { course: CourseEntry }) {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [removing, setRemoving] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  async function handleClick() {
    if (removing) return
    if (!confirm) {
      setConfirm(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setConfirm(false), 4000)
      return
    }

    setRemoving(true)
    setConfirm(false)
    const result = await removeCourseAction(course.id)

    if (result.ok) {
      dispatchInAppToast({ title: 'Course removed', description: `"${course.name}" was removed from Stay Focused.`, tone: 'info' })
      router.refresh()
    } else {
      dispatchInAppToast({ title: 'Could not remove course', description: result.error ?? 'Try again.', tone: 'error' })
      setRemoving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.65rem 0', borderBottom: '1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent)' }}>
      <div style={{ minWidth: 0 }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {course.name}
        </span>
        {course.code && (
          <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{course.code}</span>
        )}
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={removing}
        title={confirm ? 'Click again to confirm removal' : 'Remove imported course from Stay Focused'}
        style={{
          flexShrink: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '12px',
          fontWeight: 500,
          padding: '0.3rem 0.65rem',
          borderRadius: 'var(--radius-control)',
          border: confirm
            ? '1px solid color-mix(in srgb, var(--red) 60%, var(--border-subtle) 40%)'
            : '1px solid color-mix(in srgb, var(--red) 35%, var(--border-subtle) 65%)',
          background: confirm
            ? 'color-mix(in srgb, var(--red) 12%, var(--surface-base) 88%)'
            : 'transparent',
          color: 'var(--red)',
          cursor: removing ? 'default' : 'pointer',
          opacity: removing ? 0.5 : 1,
          transition: 'background 0.1s, border-color 0.1s',
        }}
      >
        {removing
          ? <Loader2 style={{ width: '0.75rem', height: '0.75rem' }} className="animate-spin" />
          : <Trash2 style={{ width: '0.75rem', height: '0.75rem' }} />}
        {confirm ? 'Confirm removal' : 'Remove imported course'}
      </button>
    </div>
  )
}

export function CourseDangerZone({ courses }: Props) {
  const [open, setOpen] = useState(false)

  if (courses.length === 0) return null

  return (
    <div className="section-shell" style={{ marginTop: '2rem' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
          background: 'transparent',
          border: 0,
          padding: '0.85rem 1rem',
          textAlign: 'left',
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-muted)' }}>Course cleanup</span>
        <ChevronDown
          className={cn('h-4 w-4 text-sf-muted transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div style={{ padding: '0 1rem 1rem', borderTop: '1px solid color-mix(in srgb, var(--border-subtle) 60%, transparent)' }}>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0.75rem 0 0.5rem' }}>
            Remove imported course records from Stay Focused. Your Canvas data and saved Study Library items are unaffected.
          </p>
          {courses.map((c) => (
            <CourseRemoveRow key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  )
}
