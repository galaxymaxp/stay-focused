'use client'

import { useState } from 'react'
import { CheckCircle2, Circle, BookOpen, Play, Layers, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/cn'
import { StatusBadge, TypeBadge } from '@/components/ui/Badge'
import { tasks, learnModules } from '@/lib/mock-data'
import type { Course } from '@/lib/mock-data'

type Tab = 'learn' | 'tasks' | 'quiz'

type Props = {
  course: Course
}

function LearnTab({ courseId }: { courseId: string }) {
  const modules = learnModules.filter((m) => m.courseId === courseId)

  const all = [
    { id: 'l1', title: 'Week 1: Course Introduction', type: 'module', duration: '20 min', completed: true },
    { id: 'l2', title: 'Week 2: Foundations', type: 'module', duration: '35 min', completed: true },
    { id: 'l3', title: 'Week 3: Core Concepts', type: 'module', duration: '40 min', completed: false },
    { id: 'l4', title: 'Week 4: Applied Practice', type: 'module', duration: '30 min', completed: false },
    ...modules.map((m) => ({ id: m.id, title: m.title, type: m.type, duration: m.duration, completed: false })),
  ]

  return (
    <div className="space-y-2">
      {all.map((item) => {
        const Icon = item.type === 'video' ? Play : item.type === 'reading' ? BookOpen : Layers
        return (
          <div
            key={item.id}
            className="flex items-center gap-4 rounded-xl border border-sf-border bg-sf-surface p-4 hover:bg-sf-surface-2 transition-colors cursor-pointer group"
          >
            <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0', item.completed ? 'bg-sf-success-bg' : 'bg-sf-surface-2')}>
              <Icon className={cn('h-4 w-4', item.completed ? 'text-sf-success' : 'text-sf-muted')} />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm font-medium', item.completed ? 'text-sf-muted line-through' : 'text-sf-text')}>{item.title}</p>
              <p className="text-xs text-sf-subtle mt-0.5">{item.duration}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <TypeBadge type={item.type} />
              {item.completed ? (
                <CheckCircle2 className="h-4 w-4 text-sf-success" />
              ) : (
                <ArrowRight className="h-4 w-4 text-sf-border group-hover:text-sf-accent transition-colors" />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TasksTab({ courseId }: { courseId: string }) {
  const courseTasks = tasks.filter((t) => t.courseId === courseId)
  if (courseTasks.length === 0) {
    return <p className="text-sm text-sf-muted py-8 text-center">No tasks for this course.</p>
  }

  return (
    <div className="space-y-2">
      {courseTasks.map((task) => (
        <div
          key={task.id}
          className="flex items-center gap-4 rounded-xl border border-sf-border bg-sf-surface p-4 hover:bg-sf-surface-2 transition-colors group"
        >
          <div className="flex-shrink-0">
            {task.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-sf-success" />
            ) : (
              <Circle className="h-4 w-4 text-sf-border group-hover:text-sf-muted transition-colors" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={cn('text-sm font-medium text-sf-text truncate', task.status === 'completed' && 'line-through text-sf-muted')}>
              {task.title}
            </p>
            <p className="text-xs text-sf-muted mt-0.5">Due {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <TypeBadge type={task.type} />
            <StatusBadge status={task.status} />
          </div>
        </div>
      ))}
    </div>
  )
}

function QuizTab() {
  const quizzes = [
    { id: 'q1', title: 'Week 3 Comprehension Quiz', questions: 10, status: 'available', score: null },
    { id: 'q2', title: 'Midterm Practice Test', questions: 25, status: 'available', score: null },
    { id: 'q3', title: 'Week 1 Quiz', questions: 8, status: 'completed', score: 92 },
    { id: 'q4', title: 'Week 2 Quiz', questions: 8, status: 'completed', score: 87 },
  ]

  return (
    <div className="space-y-2">
      {quizzes.map((q) => (
        <div
          key={q.id}
          className="flex items-center gap-4 rounded-xl border border-sf-border bg-sf-surface p-4 hover:bg-sf-surface-2 transition-colors cursor-pointer group"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sf-text">{q.title}</p>
            <p className="text-xs text-sf-muted mt-0.5">{q.questions} questions</p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {q.score !== null ? (
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-semibold', q.score >= 90 ? 'text-sf-success' : q.score >= 70 ? 'text-sf-warning' : 'text-sf-error')}>
                  {q.score}%
                </span>
                <StatusBadge status="completed" />
              </div>
            ) : (
              <button className="rounded-lg bg-sf-accent-light text-sf-accent text-xs font-semibold px-3 py-1.5 hover:bg-sf-accent hover:text-white transition-colors">
                Start Quiz
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'learn', label: 'Learn' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'quiz', label: 'Quiz' },
]

export function CourseWorkspace({ course }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('learn')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-sf-border mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab.id
                ? 'border-sf-accent text-sf-accent'
                : 'border-transparent text-sf-muted hover:text-sf-text',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'learn' && <LearnTab courseId={course.id} />}
      {activeTab === 'tasks' && <TasksTab courseId={course.id} />}
      {activeTab === 'quiz' && <QuizTab />}
    </div>
  )
}
