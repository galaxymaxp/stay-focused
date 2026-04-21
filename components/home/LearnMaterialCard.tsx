import Link from 'next/link'
import { Play, BookOpen, Layers, Video } from 'lucide-react'
import { TypeBadge } from '@/components/ui/Badge'
import type { LearnModule } from '@/lib/mock-data'

const typeIcons = {
  reading: BookOpen,
  video: Video,
  module: Layers,
  lesson: Play,
}

type Props = {
  module: LearnModule
}

export function LearnMaterialCard({ module: mod }: Props) {
  const Icon = typeIcons[mod.type] ?? BookOpen

  return (
    <Link
      href={`/courses/${mod.courseId}`}
      className="flex items-start gap-4 rounded-xl border border-sf-border bg-sf-surface p-5 hover:border-sf-accent/30 hover:shadow-sm transition-all group"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-sf-surface-2 border border-sf-border group-hover:bg-sf-accent-light group-hover:border-sf-accent/20 transition-colors">
        <Icon className="h-4 w-4 text-sf-muted group-hover:text-sf-accent transition-colors" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="text-sm font-medium text-sf-text leading-5 line-clamp-2 group-hover:text-sf-accent transition-colors">
            {mod.title}
          </p>
        </div>
        <p className="text-xs text-sf-muted mb-2">{mod.course}</p>
        <div className="flex items-center gap-2">
          <TypeBadge type={mod.type} />
          <span className="text-xs text-sf-subtle">{mod.duration}</span>
        </div>
      </div>
    </Link>
  )
}
