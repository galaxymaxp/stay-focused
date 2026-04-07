# Stay Focused

A calendar-first student workflow app that turns Canvas course and module content into a clearer command center.

**Core problem it solves:** Canvas is noisy. Stay Focused syncs your courses, processes them with AI, and surfaces only what matters — what to do now, what to read next, and what's coming up.

---

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Styling | Tailwind CSS v4 + custom design system in `globals.css` |
| Database | Supabase (PostgreSQL, no auth, RLS disabled — personal use) |
| AI processing | OpenAI — called once at sync time to extract structure from raw Canvas content |
| Canvas integration | Canvas REST API v1 (courses, modules, assignments, announcements, files) |
| Deployment | Vercel |

---

## How it works

1. **Sync** — Visit `/canvas`, enter a Canvas URL and access token, select courses to sync.
2. **Ingest** — For each course, the app fetches assignments, announcements, modules, and files. PDFs and HTML pages are extracted. Everything is compiled into a structured text blob (`raw_content`).
3. **Process** — OpenAI parses `raw_content` into structured data: module title, summary, key concepts, tasks, deadlines, and study prompts.
4. **Surface** — The processed data drives the entire UI: Today dashboard, Learn workspace, Do task list, Calendar, and Quiz.

---

## Key routes

| Route | Purpose |
|---|---|
| `/` | Today — command center: freshest module bulletin, best next step, urgency sections, announcements |
| `/learn` | Learn overview — all modules by course |
| `/modules/:id/learn` | Module Learn workspace — study notes, term bank, source files |
| `/modules/:id/do` | Module task list with urgency scoring |
| `/modules/:id/learn/resources/:resourceId` | Individual resource reader |
| `/courses` | Course overview — all synced courses with module snapshots |
| `/do` | Global task list grouped by urgency |
| `/calendar` | Calendar view of all deadlines |
| `/canvas` | Canvas sync flow — connect, select courses, sync |
| `/settings` | Appearance — theme mode and accent color |

---

## Project structure

```
app/                    Next.js App Router pages
  page.tsx              Today (home) dashboard
  canvas/               Canvas sync flow
  courses/              Course overview + per-course Learn
  modules/[id]/         Module Learn, Do, Review, Source workspaces
  learn/                Global Learn overview
  do/                   Global task list
  calendar/             Calendar view
  settings/             Theme settings
  globals.css           Full design system (CSS variables, layout, components)
  layout.tsx            Root layout — AppShell + ThemeProvider

actions/                Server actions
  canvas.ts             Full Canvas sync pipeline
  tasks.ts              Task status toggle
  modules.ts            Module delete
  module-resource-study-state.ts
  module-terms.ts

components/             React components (RSC + client)
  AppShell.tsx          Sidebar nav + sticky topbar + layout grid
  TodayDashboard.tsx    Home page sections (bulletin, hero, urgency groups)
  ModuleBulletin.tsx    Freshest module bulletin card (Home)
  AnnouncementsBand.tsx Canvas announcements feed (Home)
  ModuleLensShell.tsx   Shared Learn/Do/Review module wrapper
  ConnectCanvasFlow.tsx Canvas connection + sync UI (client, SSR-disabled)
  ... (40+ component files)

lib/                    Business logic + data layer
  clarity-workspace.ts  Today/workspace orchestration + scoring
  module-workspace.ts   Per-module Learn experience builder
  workspace-queries.ts  All Supabase SELECT queries
  workspace-adapter.ts  DB row → domain type mapping + action scoring
  announcements.ts      Canvas announcement parser (for Home feed)
  canvas.ts             Canvas REST API client
  canvas-sync.ts        Sync normalization helpers
  canvas-resource-extraction.ts  PDF/HTML/ZIP text extraction
  openai.ts             OpenAI client + module processing prompt
  supabase.ts           Supabase client singleton
  types.ts              All domain type definitions

supabase/migrations/    10 migration files — canonical schema
```

---

## Local setup

1. Clone the repo.
2. Copy `.env.example` to `.env.local` and fill in the required values:
   - `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon key
   - `OPENAI_API_KEY` — used only at sync time
   - `CANVAS_API_URL` — your institution's Canvas base URL (optional; can be entered in the UI)
   - `CANVAS_API_TOKEN` — your Canvas access token (optional; can be entered in the UI)
3. Apply migrations to your Supabase project:
   ```
   supabase db push
   ```
   or apply each file in `supabase/migrations/` in order against your Supabase SQL editor.
4. Install dependencies and start the dev server:
   ```
   npm install
   npm run dev
   ```

---

## Home page (Today)

The Home page (`/`) is the student command center. After syncing at least one course it shows:

1. **Latest module bulletin** — the most recently released processed module, with its summary, key concepts, and direct links to Learn and Do.
2. **Best next step** — the single highest-scored task or module item, with urgency context and inline controls.
3. **Announcements** — recent Canvas announcements extracted from synced courses. Currently parsed from `raw_content` at render time (no separate `announcements` table yet — see limitations).
4. **Needs attention** — tasks with `planning_annotation = needs_attention` (up to 4).
5. **Worth reviewing** — modules and tasks marked `worth_reviewing` (up to 4).
6. **Coming up** — lower-urgency upcoming items (up to 6).

---

## Scoring and urgency

Task and module items are ranked by `actionScore` (computed in `lib/workspace-adapter.ts`):

- Overdue tasks score highest
- Tasks due today or tomorrow score very high
- Module freshness score (`getModuleFreshnessScore`) adds recency signal
- `priority_signal = high` adds a fixed bonus
- `planning_annotation` from the user overrides automatic scoring

---

## Reprocess failed PDFs

If older `module_resources` rows failed because PDF extraction was broken:

```bash
npm run reprocess:resources -- --failed-pdfs
```

To target specific files:

```bash
npm run reprocess:resources -- --title "Student Handbook.pdf"
```

To rebuild the module-level AI summary after re-extraction, unsync that course in the app and sync it again from `/canvas`.

---

## Refresh Canvas Pages

Canvas Page extraction is picked up during normal course sync. For courses synced before Page support landed, unsync and re-sync from `/canvas`.

---

## Known limitations and follow-up work

- **No dedicated announcements table** — announcements are embedded in `raw_content` and parsed at render time from the most recent modules. A future migration should add an `announcements` table for persistent, queryable storage.
- **No course classification** — courses cannot yet be marked as academic, non-academic, or announcements-only. All synced courses are treated identically.
- **Quiz has no dedicated route** — `ModuleQuickQuiz` is embedded inside the study notes accordion in the module Learn workspace. A dedicated `/modules/:id/quiz` route is the planned next step.
- **Do Now is not implemented** — the product direction calls for a focused activity-start prompt helper. Currently only the `nextBestMove` hero card on Today approximates this.
- **Review is a redirect** — `/modules/:id/review` redirects to the study-notes anchor in `/modules/:id/learn`. A distinct review experience is planned.
- **No re-sync** — syncing a course that has already been synced throws an error. Incremental re-sync is not yet implemented.
