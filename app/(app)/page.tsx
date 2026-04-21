import { PrimaryTaskHero } from '@/components/home/PrimaryTaskHero'
import { TaskList } from '@/components/home/TaskList'
import { LearnMaterialCard } from '@/components/home/LearnMaterialCard'
import { tasks, learnModules, primaryTask } from '@/lib/mock-data'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10 lg:px-10 lg:py-12 space-y-10">
      {/* Primary Task */}
      <PrimaryTaskHero task={primaryTask} />

      {/* Latest Tasks */}
      <section>
        <TaskList tasks={tasks} />
      </section>

      {/* Latest Learn Material */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-sf-text">Latest Learn Material</h2>
          <Link href="/courses" className="flex items-center gap-1 text-xs text-sf-accent hover:underline">
            Browse all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {learnModules.map((mod) => (
            <LearnMaterialCard key={mod.id} module={mod} />
          ))}
        </div>
      </section>
    </div>
  )
}
