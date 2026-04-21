'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/cn'

type SyncState = 'synced' | 'syncing' | 'error' | 'attention'

const stateConfig: Record<SyncState, { label: string; color: string; icon: typeof CheckCircle }> = {
  synced: { label: 'Synced', color: 'text-sf-success', icon: CheckCircle },
  syncing: { label: 'Syncing…', color: 'text-sf-info', icon: RefreshCw },
  attention: { label: 'Needs attention', color: 'text-sf-warning', icon: Clock },
  error: { label: 'Sync error', color: 'text-sf-error', icon: AlertCircle },
}

export function SyncStatusChip() {
  const [state] = useState<SyncState>('synced')
  const config = stateConfig[state]
  const Icon = config.icon

  return (
    <button className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors border border-sf-border">
      <Icon
        className={cn('h-3.5 w-3.5', config.color, state === 'syncing' && 'animate-spin')}
      />
      <span className="hidden sm:inline">{config.label}</span>
    </button>
  )
}
