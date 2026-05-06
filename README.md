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
5. Task Drafts / Outputs

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
OCR_PROVIDER=disabled
OCR_MAX_PAGES_PER_JOB=24
OPENAI_OCR_AUTO_RUN=false
OPENAI_OCR_MAX_PAGES=5
CRON_SECRET=
EXTERNAL_SYNC_USER_BATCH_LIMIT=5
EXTERNAL_SYNC_COURSE_BATCH_LIMIT=3
EXTERNAL_SYNC_PROCESS_LIMIT=1
EXTERNAL_CANVAS_FETCH_TIMEOUT_MS=8000
EXTERNAL_SYNC_COURSE_COOLDOWN_MS=840000
EXTERNAL_SYNC_DAILY_COURSE_CAP=24
OCR_MAX_JOBS_PER_USER_PER_DAY=8
OCR_MAX_JOBS_PER_COURSE_PER_DAY=4
OPENAI_MAX_JOBS_PER_USER_PER_DAY=20
OPENAI_MAX_JOBS_PER_COURSE_PER_DAY=10
GOOGLE_VISION_API_KEY=
GOOGLE_CLOUD_PROJECT=
GOOGLE_VISION_CLIENT_EMAIL=
GOOGLE_VISION_PRIVATE_KEY=
GOOGLE_VISION_CREDENTIALS_JSON=
GOOGLE_DOCUMENT_AI_PROCESSOR_NAME=
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
- `OCR_PROVIDER`: scanned-PDF OCR provider; defaults to `disabled` (`openai`, `google_vision`, and `google_document_ai` are supported provider values; legacy `google` maps to `google_vision`)
- `OCR_MAX_PAGES_PER_JOB`: shared scanned-PDF OCR page cap per job; defaults to `24`
- `OPENAI_OCR_AUTO_RUN`: must be explicitly set to `true` before OpenAI vision OCR can run automatically during sync
- `OPENAI_OCR_MAX_PAGES`: safety cap for OpenAI OCR pages per job; defaults to `5`
- `CRON_SECRET`: shared bearer token for secured cron endpoints
- `EXTERNAL_SYNC_USER_BATCH_LIMIT`: max Canvas-connected users scanned per external sync request; defaults to `5`
- `EXTERNAL_SYNC_COURSE_BATCH_LIMIT`: max Canvas course sync jobs queued per external sync request; defaults to `3`
- `EXTERNAL_SYNC_PROCESS_LIMIT`: max externally queued Canvas sync jobs processed in the background after each external cron request; defaults to `1`
- `EXTERNAL_CANVAS_FETCH_TIMEOUT_MS`: Canvas fetch timeout for external cron/sync requests; defaults to `8000`
- `EXTERNAL_SYNC_COURSE_COOLDOWN_MS`: per-course external sync queue cooldown; defaults to `840000` (14 minutes)
- `EXTERNAL_SYNC_DAILY_COURSE_CAP`: per-user daily cap for externally queued Canvas course sync jobs; defaults to `24`
- `OCR_MAX_JOBS_PER_USER_PER_DAY`, `OCR_MAX_JOBS_PER_COURSE_PER_DAY`: automatic OCR daily queue caps; defaults to `8` and `4`
- `OPENAI_MAX_JOBS_PER_USER_PER_DAY`, `OPENAI_MAX_JOBS_PER_COURSE_PER_DAY`: OpenAI-backed generation daily queue caps; defaults to `20` and `10`
- `GOOGLE_CLOUD_PROJECT`, `GOOGLE_VISION_CLIENT_EMAIL`, `GOOGLE_VISION_PRIVATE_KEY`: preferred Vercel service-account configuration for `OCR_PROVIDER=google_vision`; private keys may use escaped `\n` newlines
- `GOOGLE_VISION_CREDENTIALS_JSON`: optional single-env service-account JSON fallback for Google Vision
- `GOOGLE_VISION_API_KEY`: optional API key fallback for `OCR_PROVIDER=google_vision`
- `GOOGLE_DOCUMENT_AI_PROCESSOR_NAME`: processor resource for `OCR_PROVIDER=google_document_ai`; use `projects/<project>/locations/<location>/processors/<processor>`
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

## External Canvas Sync Cron

Vercel Hobby cron is not suitable for 15-minute schedules, so use cron-job.org to call:

```text
GET https://<your-domain>/api/cron/external-sync
Authorization: Bearer <CRON_SECRET>
```

cron-job.org supports custom request headers through `extendedData.headers` in its REST API and supports schedules with `minutes: [0, 15, 30, 45]`. The endpoint verifies the bearer token, takes a short database lock, uses bounded Canvas fetch timeouts, scans a small batch of Canvas-connected users, and queues bounded `canvas_sync` work only. After the response is scheduled, the background processor handles a small number of externally queued sync jobs, refreshes existing Canvas resources, preserves good extracted/OCR text for unchanged file identities, rebuilds module content from the final preserved resource text, and only queues OCR when scanned PDFs still need readable text.

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
