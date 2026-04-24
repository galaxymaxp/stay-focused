# Stay Focused

Stay Focused is a Next.js study workspace that syncs Canvas data into Supabase, reduces school work into the clearest next move, and saves generated outputs into one persistent Study Library.

## App Overview

- Main pages: Home, Courses, Study Library, Calendar, Settings
- `Study Library` is the permanent generated-content hub for both Learning outputs and Task drafts
- Drafts are no longer a standalone primary navigation destination
- `/drafts` routes remain as compatibility entry points and may redirect into Study Library views
- Product direction stays action-first: one purpose per page, lower cognitive load, persistent outputs, and soft-glow responsive UI with a user-configurable accent color

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` and provide the required variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
OPENAI_DO_NOW_MODEL=gpt-5-mini
CANVAS_API_URL=
CANVAS_API_TOKEN=
```

3. Apply Supabase migrations:

```bash
npx supabase db push
```

4. Start the app locally:

```bash
npm run dev
```

## Env Variables

- `NEXT_PUBLIC_SUPABASE_URL`: hosted Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: client-facing anon key for that project
- `OPENAI_API_KEY`: required for AI-backed module processing, task outputs, Deep Learn, and cached course summaries
- `OPENAI_DO_NOW_MODEL`: optional override for the task-output model
- `CANVAS_API_URL`: Canvas base URL used for sync
- `CANVAS_API_TOKEN`: Canvas personal access token for sync

## Verification Commands

```bash
npm run lint
npm run typecheck
npm run build
npx tsx scripts/ui-runtime-check.ts
npx tsx scripts/verify-canvas-flow.ts
```

`ui-runtime-check.ts` covers runtime UI routes with Playwright. `verify-canvas-flow.ts` checks the lower-level sync and persistence path.

## Latest Scan Snapshot

Current focus after the April 24, 2026 roadmap-alignment pass:

- Study Library remains the main saved-content destination
- `/drafts` is treated as a compatibility surface, not a returned primary page
- `notifyCompletion()` now emits in-app toasts for active tabs while preserving hidden-tab browser notifications and sound preferences
- course page summaries are now persisted on `public.courses` instead of calling OpenAI on every render
- the repository includes a migration for cached course-summary fields
- `npm run lint`, `npm run typecheck`, and `npm run build` all succeeded after this pass
- local production route checks returned `200` for `/`, `/courses`, `/library`, `/settings`, and `/canvas`

## Stack Snapshot

- Next.js 16.2.2 App Router
- React 19.2.4
- TypeScript 5
- Tailwind CSS 4
- Supabase SSR + Supabase JS
- OpenAI Node SDK 6
- `pdf-parse` and `jszip` for learning-material extraction
- Playwright for runtime UI verification
- Windows + VS Code development environment

## Repository Notes

- routes live under `app/`
- server actions live under `actions/`
- shared logic lives under `lib/`
- UI components live under `components/`
- product docs live under `docs/`
- Supabase migrations and notes live under `supabase/`
