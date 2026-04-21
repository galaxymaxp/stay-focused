import { Menu } from 'lucide-react'
import { AnnouncementsPanel } from './AnnouncementsPanel'
import { SyncStatusChip } from './SyncStatusChip'
import { ProfileDropdown } from './ProfileDropdown'

type Props = {
  onMenuClick: () => void
  pageTitle?: string
}

export function Topnav({ onMenuClick, pageTitle }: Props) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-sf-border bg-sf-surface px-5 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-sf-muted hover:bg-sf-surface-2 hover:text-sf-text transition-colors lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
        {pageTitle && (
          <span className="text-sm font-medium text-sf-muted hidden sm:block">{pageTitle}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <SyncStatusChip />
        <AnnouncementsPanel />
        <ProfileDropdown />
      </div>
    </header>
  )
}
