export const STAY_FOCUSED_TOAST_EVENT = 'stay-focused:toast'

export type StayFocusedToastTone = 'success' | 'error' | 'info'

export interface StayFocusedToastDetail {
  title: string
  description: string
  tone: StayFocusedToastTone
  tag?: string
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const permission = await Notification.requestPermission()
  return permission === 'granted'
}

export function showBrowserNotification(title: string, body: string, tag?: string) {
  if (typeof window === 'undefined' || Notification.permission !== 'granted') return
  if (!isBrowserNotificationsEnabled()) return

  new Notification(title, {
    body,
    tag: tag ?? 'stay-focused',
    icon: '/icon-256.svg',
    badge: '/badge-96.svg',
    requireInteraction: false,
  })
}

export function isBrowserNotificationsEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('stay-focused.browser-notifications-enabled') !== 'false'
}

export function setBrowserNotificationsEnabled(enabled: boolean) {
  localStorage.setItem('stay-focused.browser-notifications-enabled', String(enabled))
}

export function dispatchInAppToast(detail: StayFocusedToastDetail) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<StayFocusedToastDetail>(STAY_FOCUSED_TOAST_EVENT, {
      detail,
    }),
  )
}

function getNotificationVolume(): number {
  if (typeof window === 'undefined') return 0.5
  const stored = localStorage.getItem('stay-focused.sound-volume')
  const parsed = stored ? parseFloat(stored) : 0.5
  return isNaN(parsed) ? 0.5 : Math.max(0, Math.min(1, parsed))
}

function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('stay-focused.sound-enabled') !== 'false'
}

export function setNotificationVolume(volume: number) {
  localStorage.setItem('stay-focused.sound-volume', String(Math.max(0, Math.min(1, volume))))
}

export function setSoundEnabled(enabled: boolean) {
  localStorage.setItem('stay-focused.sound-enabled', String(enabled))
}

export function playNotificationSound(soundType: 'success' | 'error' | 'info' = 'success') {
  if (typeof window === 'undefined') return
  if (!isSoundEnabled()) return

  const soundMap: Record<typeof soundType, string> = {
    success: '/sounds/success.mp3',
    error: '/sounds/error.mp3',
    info: '/sounds/info.mp3',
  }

  const audio = new Audio(soundMap[soundType])
  audio.volume = getNotificationVolume()
  audio.play().catch(() => {
    // Autoplay may be blocked — silently ignore
  })
}

export function notifyCompletion(
  title: string,
  description: string,
  options?: {
    showBrowser?: boolean
    playSound?: boolean
    soundType?: StayFocusedToastTone
    tag?: string
  },
) {
  const { showBrowser = true, playSound = false, soundType = 'success', tag } = options ?? {}

  dispatchInAppToast({
    title,
    description,
    tone: soundType,
    tag,
  })

  if (showBrowser && typeof document !== 'undefined' && document.hidden) {
    showBrowserNotification(title, description, tag)
  }

  if (playSound) {
    playNotificationSound(soundType)
  }
}
