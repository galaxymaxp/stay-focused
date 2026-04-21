export type Course = {
  id: string
  code: string
  name: string
  color: string
  instructor: string
  nextDue: string | null
  nextDueDate: string | null
  lastActivity: string
  moduleCount: number
  taskCount: number
}

export type Task = {
  id: string
  title: string
  course: string
  courseId: string
  dueDate: string
  status: 'not_started' | 'in_progress' | 'completed' | 'overdue'
  priority: 'high' | 'medium' | 'low'
  type: 'assignment' | 'quiz' | 'discussion' | 'lab' | 'reading'
}

export type Draft = {
  id: string
  title: string
  source: string
  courseId: string
  type: 'essay' | 'study_guide' | 'notes' | 'flashcards' | 'template' | 'outline'
  status: 'ready' | 'generating' | 'failed' | 'in_progress'
  updatedAt: string
  wordCount?: number
  excerpt?: string
}

export type Announcement = {
  id: string
  course: string
  courseId: string
  title: string
  body: string
  time: string
  unread: boolean
}

export type CalendarEvent = {
  id: string
  title: string
  course: string
  courseId: string
  date: string
  type: 'deadline' | 'task' | 'quiz' | 'event'
  color: string
}

export type LearnModule = {
  id: string
  title: string
  course: string
  courseId: string
  type: 'reading' | 'video' | 'module' | 'lesson'
  duration: string
  updatedAt: string
}

export const courses: Course[] = [
  {
    id: 'cs101',
    code: 'CS 101',
    name: 'Introduction to Computer Science',
    color: '#4B57E8',
    instructor: 'Dr. Chen',
    nextDue: 'Lab 4 – Data Structures',
    nextDueDate: '2026-04-25',
    lastActivity: '2h ago',
    moduleCount: 12,
    taskCount: 3,
  },
  {
    id: 'hist200',
    code: 'HIST 200',
    name: 'Modern World History',
    color: '#E8824B',
    instructor: 'Prof. Williams',
    nextDue: 'Essay Draft – Industrial Revolution',
    nextDueDate: '2026-04-28',
    lastActivity: '1d ago',
    moduleCount: 9,
    taskCount: 2,
  },
  {
    id: 'biol150',
    code: 'BIOL 150',
    name: 'Biology Fundamentals',
    color: '#22C55E',
    instructor: 'Dr. Park',
    nextDue: 'Lab Report – Cell Membrane',
    nextDueDate: '2026-04-24',
    lastActivity: '3h ago',
    moduleCount: 11,
    taskCount: 2,
  },
  {
    id: 'math301',
    code: 'MATH 301',
    name: 'Calculus III',
    color: '#E84B9E',
    instructor: 'Prof. Davis',
    nextDue: 'Problem Set 8',
    nextDueDate: '2026-04-27',
    lastActivity: '2d ago',
    moduleCount: 14,
    taskCount: 1,
  },
  {
    id: 'eng220',
    code: 'ENG 220',
    name: 'Technical Writing',
    color: '#0EA5E9',
    instructor: 'Ms. Johnson',
    nextDue: 'Draft Outline – Technical Manual',
    nextDueDate: '2026-04-23',
    lastActivity: '5h ago',
    moduleCount: 8,
    taskCount: 2,
  },
]

export const tasks: Task[] = [
  {
    id: 't1',
    title: 'Lab 4: Data Structures',
    course: 'CS 101',
    courseId: 'cs101',
    dueDate: '2026-04-25',
    status: 'in_progress',
    priority: 'high',
    type: 'lab',
  },
  {
    id: 't2',
    title: 'Essay Draft: Industrial Revolution',
    course: 'HIST 200',
    courseId: 'hist200',
    dueDate: '2026-04-28',
    status: 'not_started',
    priority: 'high',
    type: 'assignment',
  },
  {
    id: 't3',
    title: 'Lab Report: Cell Membrane Structure',
    course: 'BIOL 150',
    courseId: 'biol150',
    dueDate: '2026-04-24',
    status: 'in_progress',
    priority: 'medium',
    type: 'lab',
  },
  {
    id: 't4',
    title: 'Problem Set 8',
    course: 'MATH 301',
    courseId: 'math301',
    dueDate: '2026-04-27',
    status: 'not_started',
    priority: 'medium',
    type: 'assignment',
  },
  {
    id: 't5',
    title: 'Draft Outline: Technical Manual',
    course: 'ENG 220',
    courseId: 'eng220',
    dueDate: '2026-04-23',
    status: 'in_progress',
    priority: 'medium',
    type: 'assignment',
  },
  {
    id: 't6',
    title: 'Midterm Review Quiz',
    course: 'CS 101',
    courseId: 'cs101',
    dueDate: '2026-04-30',
    status: 'not_started',
    priority: 'low',
    type: 'quiz',
  },
  {
    id: 't7',
    title: 'Discussion Post: WWI Causes',
    course: 'HIST 200',
    courseId: 'hist200',
    dueDate: '2026-04-22',
    status: 'completed',
    priority: 'low',
    type: 'discussion',
  },
  {
    id: 't8',
    title: 'Reading: Chapter 9 – Genetics',
    course: 'BIOL 150',
    courseId: 'biol150',
    dueDate: '2026-04-26',
    status: 'not_started',
    priority: 'low',
    type: 'reading',
  },
]

export const drafts: Draft[] = [
  {
    id: 'd1',
    title: 'Essay: Industrial Revolution Impact on Labor',
    source: 'HIST 200 – Module 4: Industrialization',
    courseId: 'hist200',
    type: 'essay',
    status: 'ready',
    updatedAt: '2h ago',
    wordCount: 1240,
    excerpt:
      'The Industrial Revolution fundamentally transformed the nature of labor across Europe and North America, shifting populations from agrarian communities to urban factory centers…',
  },
  {
    id: 'd2',
    title: 'Study Guide: Cell Biology & Membrane Transport',
    source: 'BIOL 150 – Chapter 7',
    courseId: 'biol150',
    type: 'study_guide',
    status: 'ready',
    updatedAt: '1d ago',
    wordCount: 680,
    excerpt:
      'Cell membranes are selectively permeable structures composed of a phospholipid bilayer embedded with proteins. Transport mechanisms include passive and active processes…',
  },
  {
    id: 'd3',
    title: 'Lab 3 Analysis Notes',
    source: 'CS 101 – Lab 3: Sorting Algorithms',
    courseId: 'cs101',
    type: 'notes',
    status: 'in_progress',
    updatedAt: '30m ago',
    wordCount: 320,
    excerpt: 'Comparative analysis of bubble sort vs quicksort performance metrics across varying input sizes…',
  },
  {
    id: 'd4',
    title: 'Calculus Concept Flashcards',
    source: 'MATH 301 – Week 6: Multivariable',
    courseId: 'math301',
    type: 'flashcards',
    status: 'generating',
    updatedAt: 'just now',
  },
  {
    id: 'd5',
    title: 'Technical Report Template',
    source: 'ENG 220 – Assignment 2',
    courseId: 'eng220',
    type: 'template',
    status: 'failed',
    updatedAt: '3d ago',
  },
]

export const announcements: Announcement[] = [
  {
    id: 'a1',
    course: 'CS 101',
    courseId: 'cs101',
    title: 'Lab 4 instructions posted – please review before Friday',
    body: 'Lab 4 has been posted to the course modules. Make sure you review the starter code before the session.',
    time: '2h ago',
    unread: true,
  },
  {
    id: 'a2',
    course: 'HIST 200',
    courseId: 'hist200',
    title: 'Essay draft deadline moved to April 28',
    body: 'Due to the campus closure, your essay draft deadline has been extended to April 28 at 11:59 PM.',
    time: '5h ago',
    unread: true,
  },
  {
    id: 'a3',
    course: 'BIOL 150',
    courseId: 'biol150',
    title: 'Lab report rubric updated',
    body: 'Minor updates to the grading rubric for the Cell Membrane lab report. Please re-download.',
    time: '1d ago',
    unread: false,
  },
  {
    id: 'a4',
    course: 'MATH 301',
    courseId: 'math301',
    title: 'Office hours rescheduled this week',
    body: "Prof. Davis' office hours moved from Tuesday to Wednesday 2–4 PM this week only.",
    time: '2d ago',
    unread: false,
  },
]

export const learnModules: LearnModule[] = [
  {
    id: 'lm1',
    title: 'Introduction to Sorting Algorithms',
    course: 'CS 101',
    courseId: 'cs101',
    type: 'video',
    duration: '18 min',
    updatedAt: '2h ago',
  },
  {
    id: 'lm2',
    title: 'Chapter 9: Genetics and Heredity',
    course: 'BIOL 150',
    courseId: 'biol150',
    type: 'reading',
    duration: '35 min read',
    updatedAt: '1d ago',
  },
  {
    id: 'lm3',
    title: 'Week 6: Multivariable Integration',
    course: 'MATH 301',
    courseId: 'math301',
    type: 'module',
    duration: '45 min',
    updatedAt: '2d ago',
  },
  {
    id: 'lm4',
    title: 'Technical Writing: Audience Analysis',
    course: 'ENG 220',
    courseId: 'eng220',
    type: 'lesson',
    duration: '20 min',
    updatedAt: '3d ago',
  },
]

export const calendarEvents: CalendarEvent[] = [
  { id: 'e1', title: 'Lab 4 Due', course: 'CS 101', courseId: 'cs101', date: '2026-04-25', type: 'deadline', color: '#4B57E8' },
  { id: 'e2', title: 'Essay Draft Due', course: 'HIST 200', courseId: 'hist200', date: '2026-04-28', type: 'deadline', color: '#E8824B' },
  { id: 'e3', title: 'Lab Report Due', course: 'BIOL 150', courseId: 'biol150', date: '2026-04-24', type: 'deadline', color: '#22C55E' },
  { id: 'e4', title: 'Problem Set 8', course: 'MATH 301', courseId: 'math301', date: '2026-04-27', type: 'deadline', color: '#E84B9E' },
  { id: 'e5', title: 'Draft Outline Due', course: 'ENG 220', courseId: 'eng220', date: '2026-04-23', type: 'deadline', color: '#0EA5E9' },
  { id: 'e6', title: 'Discussion Post', course: 'HIST 200', courseId: 'hist200', date: '2026-04-22', type: 'task', color: '#E8824B' },
  { id: 'e7', title: 'Midterm Review Quiz', course: 'CS 101', courseId: 'cs101', date: '2026-04-30', type: 'quiz', color: '#4B57E8' },
  { id: 'e8', title: 'Office Hours – Prof. Davis', course: 'MATH 301', courseId: 'math301', date: '2026-04-23', type: 'event', color: '#E84B9E' },
  { id: 'e9', title: 'Reading: Genetics Ch.9', course: 'BIOL 150', courseId: 'biol150', date: '2026-04-26', type: 'task', color: '#22C55E' },
]

export const primaryTask = tasks[0]
