import type { Course } from '@/lib/types'

export interface SeedModule {
  id: string
  courseId: string
  title: string
  order: number
  releasedOffsetDays: number
  estimatedMinutes: number
  prioritySignal: 'high' | 'medium' | 'low'
  rawContent: string
}

export const seedCourses: Course[] = [
  {
    id: 'course-bio-210',
    code: 'BIO 210',
    name: 'Foundations of Biology',
    term: 'Spring 2026',
    instructor: 'Dr. Imani Reyes',
    focusLabel: 'Labs and interpretation-heavy work',
    colorToken: 'green',
  },
  {
    id: 'course-cs-225',
    code: 'CS 225',
    name: 'Data Structures',
    term: 'Spring 2026',
    instructor: 'Prof. Aaron Patel',
    focusLabel: 'Builds, implementation, and debugging',
    colorToken: 'blue',
  },
  {
    id: 'course-hist-114',
    code: 'HIST 114',
    name: 'The Postwar World',
    term: 'Spring 2026',
    instructor: 'Dr. Lena Morrison',
    focusLabel: 'Reading synthesis and discussion writing',
    colorToken: 'orange',
  },
]

export const seedModules: SeedModule[] = [
  {
    id: 'module-bio-enzyme-lab',
    courseId: 'course-bio-210',
    title: 'Enzyme Kinetics Lab',
    order: 4,
    releasedOffsetDays: -1,
    estimatedMinutes: 55,
    prioritySignal: 'high',
    rawContent: `Course: BIO 210 Foundations of Biology
Module: Enzyme Kinetics Lab
Overview:
This lab explains how enzyme activity changes when substrate concentration shifts and why the Michaelis-Menten curve eventually levels off. You need to connect the graph shape to what is happening inside the reaction, not just memorize the labels.
Key concepts:
- Initial rate is measured before the reaction system starts running out of substrate.
- Saturation means adding more substrate no longer speeds the reaction much.
- Vmax and Km tell you different things about enzyme behavior.
Study prompts:
- Explain why the curve rises quickly at first and then flattens.
- Compare a low Km enzyme to a high Km enzyme in plain language.
Tasks:
- Finish pre-lab quiz | due +0d 19:00 | high | pending | 20m | Review graph interpretation and variable definitions before opening Canvas.
- Set up lab notebook table | due +1d 08:30 | medium | pending | 15m | Create the columns for substrate concentration, initial rate, and notes so class starts cleanly.
- Submit lab reflection | due +3d 20:00 | medium | pending | 35m | Use complete sentences to explain what the curve says about saturation.
`,
  },
  {
    id: 'module-bio-mitosis',
    courseId: 'course-bio-210',
    title: 'Mitosis and Cell Cycle Control',
    order: 5,
    releasedOffsetDays: -4,
    estimatedMinutes: 42,
    prioritySignal: 'medium',
    rawContent: `Course: BIO 210 Foundations of Biology
Module: Mitosis and Cell Cycle Control
Overview:
This module connects the visible stages of mitosis to the checkpoints that prevent damaged cells from dividing. The important move is understanding why each checkpoint exists, because that reasoning shows up in the next quiz.
Key concepts:
- G1, G2, and spindle checkpoints each guard a different risk.
- Cyclins help time the cycle instead of acting as a permanent on switch.
- Uncontrolled division is usually tied to failed regulation, not just fast growth.
Study prompts:
- Match each checkpoint to the mistake it prevents.
- Describe how cyclin levels change across the cycle.
Tasks:
- Read checkpoint case notes | due +2d 18:00 | medium | pending | 25m | Skim the examples and highlight what went wrong in each one.
- Draft quiz note sheet | due +4d 17:00 | low | pending | 20m | Build a one-page comparison of checkpoint roles and cycle stages.
`,
  },
  {
    id: 'module-cs-heaps',
    courseId: 'course-cs-225',
    title: 'Priority Queues and Heaps',
    order: 6,
    releasedOffsetDays: 0,
    estimatedMinutes: 60,
    prioritySignal: 'high',
    rawContent: `Course: CS 225 Data Structures
Module: Priority Queues and Heaps
Overview:
This week shifts from using simple arrays to maintaining order with heap structure rules. The main idea is not the syntax of insertion, but why the heap property lets removal stay efficient even while the array is rearranged.
Key concepts:
- A binary heap uses parent-child relationships stored inside an array.
- Heapify restores structure after inserting or removing an element.
- The root always holds the next highest-priority item.
Study prompts:
- Explain why a heap is only partially sorted.
- Walk through one insert operation and one remove operation step by step.
Tasks:
- Implement heap push and pop methods | due +1d 23:00 | high | pending | 50m | Pass the starter tests before polishing edge cases.
- Answer checkpoint quiz | due +2d 21:00 | medium | pending | 15m | Use the lecture examples to verify runtime reasoning.
- Review debugging notes | due +4d 18:00 | low | completed | 10m | Confirm where your last implementation broke and why.
`,
  },
  {
    id: 'module-cs-graphs',
    courseId: 'course-cs-225',
    title: 'Graphs and Traversal Strategy',
    order: 7,
    releasedOffsetDays: -3,
    estimatedMinutes: 48,
    prioritySignal: 'medium',
    rawContent: `Course: CS 225 Data Structures
Module: Graphs and Traversal Strategy
Overview:
This module introduces adjacency lists, breadth-first search, and depth-first search as different ways to represent and walk a graph. The real test is choosing the traversal that matches the question you are trying to answer.
Key concepts:
- Adjacency lists trade constant-time edge lookup for compact storage.
- Breadth-first search is best when distance by number of edges matters.
- Depth-first search is useful when exploring structure or connected regions.
Study prompts:
- Compare BFS and DFS using the same small graph.
- Explain what information a visited set protects you from losing.
Tasks:
- Annotate lecture graph example | due +2d 20:00 | medium | pending | 20m | Label how the queue or stack changes after each step.
- Start traversal practice set | due +5d 19:30 | medium | pending | 30m | Finish the first two questions while the lecture is still fresh.
`,
  },
  {
    id: 'module-hist-marshall',
    courseId: 'course-hist-114',
    title: 'Reconstruction and the Marshall Plan',
    order: 8,
    releasedOffsetDays: -2,
    estimatedMinutes: 50,
    prioritySignal: 'high',
    rawContent: `Course: HIST 114 The Postwar World
Module: Reconstruction and the Marshall Plan
Overview:
This module explains how postwar recovery mixed economic aid with political strategy. The reading matters most when you can show how rebuilding Europe was also a way to shape alliances and contain instability.
Key concepts:
- The Marshall Plan was economic support with strategic aims.
- Recovery policy was tied to fears about political fragmentation.
- Aid outcomes varied by local conditions and government capacity.
Study prompts:
- Explain why economic recovery and political influence were linked.
- Identify one limit of describing the Marshall Plan as pure generosity.
Tasks:
- Post discussion response | due +1d 16:00 | high | pending | 25m | Use one reading example and one lecture idea in the post.
- Mark source comparison notes | due +3d 18:30 | medium | pending | 20m | Pull one contrast between U.S. goals and European needs.
`,
  },
  {
    id: 'module-hist-decolonization',
    courseId: 'course-hist-114',
    title: 'Decolonization and New States',
    order: 9,
    releasedOffsetDays: -5,
    estimatedMinutes: 45,
    prioritySignal: 'medium',
    rawContent: `Course: HIST 114 The Postwar World
Module: Decolonization and New States
Overview:
This module follows how independence movements challenged European empires while still inheriting economic and political constraints. The through-line is that formal independence did not erase uneven power structures overnight.
Key concepts:
- National independence and state stability were not the same thing.
- Anti-colonial movements often balanced broad coalitions with local tensions.
- New states entered a world economy they did not design.
Study prompts:
- Describe one challenge that remained after independence was declared.
- Compare political freedom to economic leverage in one short example.
Tasks:
- Read Ghana case study | due +2d 17:30 | low | pending | 18m | Focus on how the case complicates a simple liberation narrative.
- Draft seminar question | due +4d 10:00 | medium | pending | 12m | Bring one question that connects decolonization to Cold War pressure.
`,
  },
]
