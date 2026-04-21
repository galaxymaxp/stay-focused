import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { drafts } from '@/lib/mock-data'
import { DraftWorkspace } from '@/components/drafts/DraftWorkspace'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ id: string }>
}

export default async function DraftDetailPage({ params }: Props) {
  const { id } = await params
  const draft = drafts.find((d) => d.id === id)
  if (!draft) notFound()

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-sf-border bg-sf-surface flex-shrink-0">
        <Link
          href="/drafts"
          className="flex items-center gap-1.5 text-sm text-sf-muted hover:text-sf-text transition-colors flex-shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Drafts
        </Link>
        <div className="w-px h-4 bg-sf-border" />
        <h1 className="text-sm font-semibold text-sf-text truncate">{draft.title}</h1>
      </div>

      {/* Workspace fills remaining height */}
      <div className="flex-1 overflow-hidden min-h-0">
        <DraftWorkspace draft={draft} />
      </div>
    </div>
  )
}
