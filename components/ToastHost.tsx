'use client'

import { useEffect, useState } from 'react'
import { STAY_FOCUSED_TOAST_EVENT, type StayFocusedToastDetail } from '@/lib/notifications'

interface ToastRecord extends StayFocusedToastDetail {
  id: string
}

const TOAST_LIFETIME_MS = 4200
const TOAST_LIMIT = 4

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastRecord[]>([])

  useEffect(() => {
    function handleToast(event: Event) {
      const detail = (event as CustomEvent<StayFocusedToastDetail>).detail
      if (!detail?.title || !detail.description) return

      const id = `${detail.tag ?? 'toast'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

      setToasts((current) => [{ id, ...detail }, ...current].slice(0, TOAST_LIMIT))

      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, TOAST_LIFETIME_MS)
    }

    window.addEventListener(STAY_FOCUSED_TOAST_EVENT, handleToast as EventListener)
    return () => window.removeEventListener(STAY_FOCUSED_TOAST_EVENT, handleToast as EventListener)
  }, [])

  if (toasts.length === 0) return null

  return (
    <div className="stay-focused-toast-host" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <article key={toast.id} className="stay-focused-toast" data-tone={toast.tone}>
          <div className="stay-focused-toast__header">
            <strong className="stay-focused-toast__title">{toast.title}</strong>
            {toast.tag ? <span className="stay-focused-toast__tag">{toast.tag}</span> : null}
          </div>
          <p className="stay-focused-toast__description">{toast.description}</p>
        </article>
      ))}
    </div>
  )
}
