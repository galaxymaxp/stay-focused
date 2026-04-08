@AGENTS.md

# Stay Focused — Claude Code Project Instructions

## Stack
- Next.js 16.2.2, React 19, TypeScript, Tailwind v4
- Supabase (DB + auth), OpenAI API
- Tests: Playwright (`tests/`)
- Migrations: `supabase/migrations/`

## Verified commands
- `npm run dev` — local dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run reprocess:resources` — re-run module resource extraction
- TODO: identify how to run Playwright tests in CI

## Product intent
Stay Focused is a calendar-first student workflow app that reduces planning friction and helps students start work faster.

## Product direction
- Home (`app/page.tsx`, `components/TodayDashboard.tsx`) should feel like a student command center — summarize what matters now.
- Freshest module bulletin/summary must be easy to notice (`components/ModuleBulletin.tsx`).
- Urgency must be visible across pages.
- Announcements are first-class content (`components/AnnouncementsBand.tsx`, `components/AnnouncementsMenu.tsx`).
- Sync must support academic, non-academic, and announcements-only courses.
- Quiz is a distinct core feature (`components/ModuleQuickQuiz.tsx`, `components/ModuleQuizWorkspace.tsx`).
- "Do Now" should push users to start tasks (`components/DoNowPanel.tsx`, `app/api/do-now/route.ts`).

## UX and design rules
- Soft-glow aesthetic; yellow is the default accent.
- Bordered cards are the primary click target — not clickable text.
- Status controls belong top-right on actionable cards (`components/TaskStatusToggle.tsx`).
- Announcements must support Mark as Read without conflating them with tasks.
- Scroll/visibility issues are urgent UX bugs — treat hidden content as broken.
- Loading states must feel alive; no dead spinners.

## Terminology
| Old | Correct |
|-----|---------|
| Suggested Action | Auto Prompt |
| "Why this is the clearest move" | Description |
| Redundant "Focus" phrasing | Remove |

## Persistence rules
- Auto Prompt output must survive navigation — use DB-backed storage, not client memory.
- Tie cache reuse to source identity + content change, not blind TTL.
- Calendar state must not leak between views — treat leakage as a bug.

## Engineering workflow
1. Read relevant files first.
2. State the minimal scope before touching code.
3. Make the smallest effective change.
4. Update related types, tests, and empty/loading/error states when behavior changes.
5. Before major schema or architecture changes, suggest a checkpoint commit.
6. Do not do unrelated refactors.
7. Call out uncertainty plainly — mark unknowns as TODO.

## End-of-task report
- Files changed
- Behavior changed
- Verification run
- Risks or incomplete parts

## File conventions
- Reuse existing lib utilities (`lib/`) and server actions (`actions/`) before adding new ones.
- Migrations go in `supabase/migrations/` with a timestamped name.
- Keep naming aligned with product language above.
