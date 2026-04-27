'use client'

import type { CSSProperties } from 'react'

export interface UserAvatarValue {
  url: string | null
  initials: string | null
}

export function UserAvatar({
  value,
  size = 32,
  active = true,
}: {
  value: UserAvatarValue
  size?: number
  active?: boolean
}) {
  if (value.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value.url}
        alt=""
        aria-hidden="true"
        style={avatarStyle(size, active)}
      />
    )
  }

  return (
    <span style={avatarStyle(size, active)}>
      {value.initials ?? <ProfileGlyph />}
    </span>
  )
}

function ProfileGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a3.75 3.75 0 1 0 0-7.5a3.75 3.75 0 0 0 0 7.5Z" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5.5 19.25a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function avatarStyle(size: number, active: boolean): CSSProperties {
  return {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: `${Math.max(11, Math.round(size * 0.34))}px`,
    fontWeight: 700,
    objectFit: 'cover',
    background: active
      ? 'color-mix(in srgb, var(--surface-selected) 84%, var(--accent) 16%)'
      : 'color-mix(in srgb, var(--surface-soft) 88%, transparent)',
    color: active ? 'var(--accent-foreground)' : 'var(--text-secondary)',
    border: `1px solid ${active
      ? 'color-mix(in srgb, var(--accent-border) 54%, var(--border-subtle) 46%)'
      : 'color-mix(in srgb, var(--border-subtle) 88%, transparent)'}`,
    overflow: 'hidden',
  }
}
