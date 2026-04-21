import { cn } from '@/lib/cn'
import type { LucideIcon } from 'lucide-react'

type Props = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-8 text-center', className)}>
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sf-surface-2 border border-sf-border mb-4">
          <Icon className="h-5 w-5 text-sf-subtle" />
        </div>
      )}
      <p className="text-sm font-medium text-sf-text">{title}</p>
      {description && <p className="text-xs text-sf-muted mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
