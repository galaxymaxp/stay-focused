import type { ReactNode } from 'react'
import { AnimatedBookLoader } from '@/components/AnimatedBookLoader'

export function PageLoadingStage({
  title,
  description,
  children,
  shellClassName = 'page-shell',
}: {
  title: string
  description?: string
  children?: ReactNode
  shellClassName?: string
}) {
  return (
    <main className={shellClassName}>
      <section className="page-loading-stage">
        <div className="page-loading-center">
          <AnimatedBookLoader />
          <div className="page-loading-copy">
            <p className="page-loading-kicker">Loading</p>
            <p className="page-loading-title">{title}</p>
            {description && <p className="page-loading-note">{description}</p>}
          </div>
        </div>

        {children ? (
          <div className="page-loading-preview" aria-hidden="true">
            {children}
          </div>
        ) : null}
      </section>
    </main>
  )
}
