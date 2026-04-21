import { cn } from '@/lib/cn'

type Props = {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function SettingsSection({ title, description, children, className }: Props) {
  return (
    <section className={cn('', className)}>
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-sf-text">{title}</h2>
        {description && <p className="text-xs text-sf-muted mt-1">{description}</p>}
      </div>
      <div className="rounded-2xl border border-sf-border bg-sf-surface overflow-hidden">
        {children}
      </div>
    </section>
  )
}

type RowProps = {
  label: string
  description?: string
  children?: React.ReactNode
  border?: boolean
}

export function SettingsRow({ label, description, children, border = true }: RowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-6 px-6 py-4', border && 'border-b border-sf-border last:border-b-0')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-sf-text">{label}</p>
        {description && <p className="text-xs text-sf-muted mt-0.5">{description}</p>}
      </div>
      {children && <div className="flex-shrink-0">{children}</div>}
    </div>
  )
}
