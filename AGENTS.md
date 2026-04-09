<!-- BEGIN:nextjs-agent-rules -->
# Stay Focused - Codex Instructions

## Mission
Make safe, scoped changes to Stay Focused without drifting from the app's student workflow purpose.

## Stack (verified)
- Next.js 16.2.2 (App Router), React 19, TypeScript, Tailwind v4
- Supabase (DB + auth), OpenAI API
- Tests: Playwright in `tests/`
- Migrations: `supabase/migrations/` - timestamped SQL files

**Note:** This is Next.js 16. APIs and conventions differ from your training data. Read `node_modules/next/dist/docs/` for reference before writing routing or middleware code.

## Verified commands
- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run lint` - ESLint check
- `npm run reprocess:resources` - re-extract module resources
- TODO: Playwright test invocation command - inspect `package.json` before assuming

## Product rules
- Calendar-first student workflow app.
- Home (`app/page.tsx`, `components/TodayDashboard.tsx`) is the command center - surface what matters now.
- Module bulletin freshness is important (`components/ModuleBulletin.tsx`).
- Urgency must be visible across pages.
- Announcements are first-class (`components/AnnouncementsBand.tsx`, `components/AnnouncementsMenu.tsx`).
- Quiz is a distinct core feature (`components/ModuleQuickQuiz.tsx`, `components/ModuleQuizWorkspace.tsx`).
- "Do Now" must push toward starting tasks (`components/DoNowPanel.tsx`, `app/api/do-now/route.ts`).

## Current requested UX direction
- Use "Auto Prompt" - not "Suggested Action".
- Use "Description" - not "Why this is the clearest move".
- Remove redundant "Focus" wording where course context makes it obvious.
- Bordered cards are the primary click target - not inline text links.
- Status controls belong in the top-right of actionable cards (`components/TaskStatusToggle.tsx`).
- Announcements support "Mark as Read" - do not conflate with task status.
- Auto Prompt output must persist durably (DB-backed, not client-only).
- Use the open-book mark as the redesign anchor: clean geometry, bold structure, academic feel, restrained accent use.
- Use the page more confidently on dashboard-heavy screens while keeping a clear grid and controlled text measure.
- Loading states are part of the design system: prefer animated loading bars, use the branded book animation only for major or spacious loading surfaces, and avoid dead spinners.
- Calendar state leakage between views is a real bug - treat it seriously.

## Implementation priorities
1. Correctness and persistence integrity
2. UX clarity and scanability
3. Visual polish

## Working rules
- Stay within requested scope - no unrelated refactors.
- Prefer small, reviewable commits.
- Reuse existing utilities in `lib/` and server actions in `actions/` before introducing new architecture.
- If behavior changes, update related tests, types, and state handling.
- If a command or workflow is uncertain, inspect the repo instead of guessing.
- Suggest a checkpoint commit before major schema or architecture changes.

## Persistence guidance
- Do not treat client memory as a cache for anything expected to survive navigation or refresh.
- Favor durable Supabase-backed storage for generated Auto Prompt results.
- Tie cache reuse to source identity + content change detection - not blind TTL.
- New DB requirements go in a migration file under `supabase/migrations/`.

## Review flags
- State leakage or stale cache behavior
- Actions becoming more cluttered rather than simpler
- Terminology that doesn't match the approved product language table
- UX regressions where content becomes less visible, less scannable, or less clickable
- Announcements treated inconsistently with the status system
- Schema or cache changes that don't clearly support persistence requirements

## End-of-task report
- Files changed
- Behavior changed
- Verification run
- Remaining risk or incomplete parts
<!-- END:nextjs-agent-rules -->
