# Stay Focused

Stay Focused is a **schedule-first student productivity app over Canvas**. The main experience is the **Today Plan / Schedule command center**, built to answer: **“What should I do next with the time I have available?”**

## Product Overview

- **Today Plan / Schedule is the primary surface** for day-to-day execution.
- **Calendar supports planning** by feeding deadlines/events into scheduling.
- **Canvas sync feeds the scheduler** with coursework context and due signals.
- **Study Library** is the persistent home for generated outputs (learning artifacts + drafts).
- **AI tools support execution, not distraction**: Deep Learn, Review, Quiz, and drafting should activate in context of scheduled study blocks.

## Current Surface Priorities

1. Schedule / Today Plan
2. Calendar (feeder)
3. Tasks
4. Deep Learn / Review / Quiz
5. Do Draft / Outputs

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
