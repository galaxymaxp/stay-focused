# Stay Focused

Stay Focused is a Next.js study dashboard that pulls course data from Canvas, stores synced workspace data in Supabase, and turns that material into a tighter action flow for students. The app is built around three jobs:

- sync courses, modules, tasks, announcements, and attachments from Canvas
- reduce the day to a clear next action on Home, Do, Tasks, and Calendar views
- turn source material into reusable study outputs such as learning packs, notes, quizzes, and task drafts

## Current Product Shape

The codebase currently exposes these main areas:

- `Home` at `/`: a "what should I do right now?" dashboard with one primary action, due-soon work, recent changes, and course snapshots
- `Canvas` at `/canvas`: connection setup, token guidance, course loading, sync actions, instructor refresh, and imported-module management
- `Courses` at `/courses` and `/courses/[id]`: course workspaces and course-level learn views
- `Modules` at `/modules/[id]/*`: module lenses for Deep Learn, Do, Quiz, Inspect, Review, and source/resource drill-down
- `Tasks` and `Do` at `/tasks` and `/do`: action-focused task views and planner-style next-step flow
- `Study Library` at `/library` and `/library/[id]`: saved generated content grouped by course
- `Drafts` at `/drafts/*`: generated draft entry points, with `/drafts` redirecting into the library task filter
- `Settings` at `/settings`: account state, Canvas shortcuts, avatar management, theme/accent controls, and browser notifications
- auth and profile APIs: `/sign-in`, `/sign-up`, `/auth/callback`, `/api/profile/avatar`, `/api/profile/avatar/upload`

## Core Capabilities

- Canvas sync with saved connection details, token creation guidance, course selection, repeat-sync protection, and unsync controls
- Supabase-backed workspace persistence for courses, modules, task items, deadlines, resources, drafts, deep-learn notes, announcements, and profile data
- AI-assisted module processing and course summaries through OpenAI
- Attachment-aware Learn flow with resource extraction, study-state tracking, resume cues, and deep links back to Canvas/original files
- Quiz generation from saved learning notes
- Saved study outputs and task drafts collected into a course-grouped library
- Auth-aware profile avatars with Google-photo fallback and custom uploads
- Theme, accent, notification-permission, and notification-sound controls

## Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- OpenAI Node SDK
- Playwright for runtime/browser verification scripts

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` from `.env.example` and fill in the required values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
OPENAI_DO_NOW_MODEL=gpt-5-mini
CANVAS_API_URL=
CANVAS_API_TOKEN=
```

Important setup notes:

- `NEXT_PUBLIC_SUPABASE_URL` must point to a hosted Supabase project, not a local CLI URL
- the app expects the Supabase migrations in `supabase/migrations/` to be applied
- `OPENAI_API_KEY` is required for AI-backed module processing and course summaries
- Canvas sync requires a valid Canvas base URL and personal access token

If you are starting from a fresh Supabase project, read `supabase/README.md` and run:

```bash
npx supabase db push
```

3. Start the app:

```bash
npm run dev
```

For a production build check:

```bash
npm run build
npm run start
```

## Verification

The repo already includes a few useful checks:

```bash
npm run lint
npm run build
npx tsx scripts/ui-runtime-check.ts
npx tsx scripts/verify-canvas-flow.ts
```

`ui-runtime-check.ts` exercises the real browser UI with Playwright. `verify-canvas-flow.ts` is the lower-level sync verification path used for Canvas flow checks.

## Scan Snapshot

Local scan performed on April 24, 2026:

- `/` rendered the empty synced-data state with "No courses synced yet"
- `/canvas` rendered the signed-out gate with "Canvas sync needs an account"
- `/sign-in` rendered the auth form correctly
- `/library` rendered the Study Library shell
- `/settings` rendered the Preferences shell with account, Canvas, theme, and notification controls

In the same pass:

- `npm run build` succeeded
- `npm run lint` succeeded

## Repository Notes

- app routes live under `app/`
- server actions live under `actions/`
- shared logic lives under `lib/`
- UI components live under `components/`
- Supabase schema and migrations live under `supabase/`
- browser/runtime helper scripts live under `scripts/`

The existing `supabase/README.md` documents schema-sensitive features in more detail, especially around resource sync, study-state tracking, task annotations, drafts, deep-learn notes, and profile avatars.
