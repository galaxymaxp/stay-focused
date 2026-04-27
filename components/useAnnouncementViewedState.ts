'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  loadAnnouncementViewedStates,
  markAnnouncementUnread,
  markAnnouncementViewed,
} from '@/actions/announcements'

export interface AnnouncementViewedStateItem {
  announcementKey: string
  moduleId: string
  supportId: string
  title: string
  postedLabel: string | null
  href: string
}

export function useAnnouncementViewedState(items: AnnouncementViewedStateItem[]) {
  const itemMap = useMemo(
    () => new Map(items.map((item) => [item.announcementKey, item])),
    [items],
  )
  const announcementKeys = useMemo(
    () => items.map((item) => item.announcementKey),
    [items],
  )
  const [viewedAnnouncementKeys, setViewedAnnouncementKeys] = useState<string[]>([])
  const [pendingAnnouncementKey, setPendingAnnouncementKey] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true

    async function hydrateViewedState() {
      try {
        const loadedKeys = await loadAnnouncementViewedStates(announcementKeys)
        if (!active) return
        setViewedAnnouncementKeys(loadedKeys)
      } catch (error) {
        if (!active) return
        console.error('Announcement viewed-state load failed:', error)
        setErrorMessage('Announcement viewed state could not be loaded right now.')
      }
    }

    setErrorMessage(null)
    setViewedAnnouncementKeys([])

    if (announcementKeys.length > 0) {
      void hydrateViewedState()
    }

    return () => {
      active = false
    }
  }, [announcementKeys])

  function setAnnouncementViewedState(announcementKey: string, viewed: boolean) {
    setErrorMessage(null)
    setPendingAnnouncementKey(announcementKey)

    startTransition(async () => {
      try {
        if (viewed) {
          const item = itemMap.get(announcementKey)
          if (!item) return

          await markAnnouncementViewed(item)
          setViewedAnnouncementKeys((current) => current.includes(announcementKey)
            ? current
            : [...current, announcementKey])
          return
        }

        await markAnnouncementUnread({ announcementKey })
        setViewedAnnouncementKeys((current) => current.filter((key) => key !== announcementKey))
      } catch (error) {
        console.error('Announcement viewed-state save failed:', error)
        setErrorMessage(viewed
          ? 'Mark viewed could not be saved right now.'
          : 'Mark unread could not be saved right now.')
      } finally {
        setPendingAnnouncementKey(null)
      }
    })
  }

  return {
    errorMessage,
    isSaving: isPending,
    pendingAnnouncementKey,
    viewedAnnouncementKeys,
    isViewed(announcementKey: string) {
      return viewedAnnouncementKeys.includes(announcementKey)
    },
    markViewed(announcementKey: string) {
      setAnnouncementViewedState(announcementKey, true)
    },
    markUnread(announcementKey: string) {
      setAnnouncementViewedState(announcementKey, false)
    },
    toggleViewed(announcementKey: string) {
      setAnnouncementViewedState(announcementKey, !viewedAnnouncementKeys.includes(announcementKey))
    },
  }
}
