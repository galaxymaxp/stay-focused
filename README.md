# Stay Focused

A calendar-first student workflow app that turns Canvas course and module content into a clearer command center.

Core problem it solves: Canvas is noisy. Stay Focused syncs your courses, processes them with AI, and surfaces what matters most: what to do now, what to read next, and what is coming up.

---

## Stack

| Layer | Tech |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19) |
| Styling | Tailwind CSS v4 + custom design system in `globals.css` |
| Database | Supabase (PostgreSQL, no auth, RLS disabled for personal use) |
| AI processing | OpenAI at sync time |
| Canvas integration | Canvas REST API v1 |
| Deployment | Vercel |

---

## How it works

1. Sync: visit `/canvas`, enter a Canvas URL and access token, then choose courses to sync.
2. Ingest: for each course, the app fetches assignments, announcements, modules, pages, discussions, and files. Readable source content is normalized into persisted `module_resources` extraction fields, while weak or unreadable items are marked honestly instead of being left blank.
3. Process: OpenAI parses compiled module content into structured data such as title, summary, concepts, tasks, deadlines, and study prompts.
4. Surface: the processed data drives Today, Learn, Do, Quiz, and supporting study flows.

---

## Key routes

| Route | Purpose |
| --- | --- |
| `/` | Today dashboard |
| `/learn` | Learn overview across courses |
| `/modules/:id/learn` | Module Learn workspace |
| `/modules/:id/inspect` | Internal resource inspection and reprocess surface |
| `/modules/:id/quiz` | Module Quiz grounded in extracted study notes |
| `/modules/:id/do` | Module task list |
| `/modules/:id/learn/resources/:resourceId` | Individual resource reader/detail page |
| `/courses` | Course overview |
| `/do` | Global task list |
| `/calendar` | Calendar view |
| `/canvas` | Canvas sync flow |
| `/settings` | Appearance settings |

---

## Project structure

```text
app/                    Next.js App Router pages
actions/                Server actions
components/             React components
lib/                    Business logic, data access, extraction, normalization
scripts/                Maintenance and backfill scripts
supabase/migrations/    Canonical schema migrations
```

---

## Local setup

1. Clone the repo.
2. Copy `.env.example` to `.env.local`.
3. Fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `OPENAI_API_KEY`
   - `CANVAS_API_URL` optional but useful for sync and reprocess
   - `CANVAS_API_TOKEN` optional but useful for sync and reprocess
4. Apply Supabase migrations.
5. Run:

```bash
npm install
npm run dev
```

---

## Reprocess persisted module resources

Phase 2 adds a targeted backfill path for existing `module_resources` rows. It reuses the current extraction logic against stored resource URLs instead of requiring a destructive full resync.

Phase 3 keeps that same reprocess path, but refreshes quality metadata at the same time. Reprocessing now updates both compatibility and trustworthiness signals in place.

Common commands:

```bash
npm run reprocess:resources -- --scope weak
```

```bash
npm run reprocess:resources -- --scope all --type docx
```

```bash
npm run reprocess:resources -- --title "Student Handbook.pdf"
```

Legacy PDF flags are still supported:

```bash
npm run reprocess:resources -- --failed-pdfs
```

Notes:

- Reprocessing is safe to run repeatedly for normal use. It refreshes extraction fields, capability metadata, and quality metadata in place.
- Protected Canvas items may still need server-side `CANVAS_API_URL` and `CANVAS_API_TOKEN` so the reprocess pass can fetch them again.
- Older rows that never stored a reusable source URL may still need a fresh sync to capture a reprocessable Canvas API URL.
- Reprocessing improves persisted resource text for Learn, Do Now, Review, and Quiz, but it does not rerun module-level AI processing automatically.

---

## Persisted resource contract

Downstream surfaces rely on the shared `module_resources` extraction shape:

- `extraction_status`
- `extracted_text`
- `extracted_text_preview`
- `extracted_char_count`
- `extraction_error`
- `metadata`

Phase 2 also relies on metadata hints such as:

- `metadata.normalizedSourceType`
- `metadata.capability`
- `metadata.lastReprocessedAt`
- `metadata.lastReprocessOutcome`
- `metadata.lastReprocessReason`

Phase 3 adds quality metadata alongside those hints:

- `metadata.quality`
- `metadata.qualityReason`
- `metadata.groundingLevel`
- `metadata.qualityMeaningfulCharCount`
- `metadata.qualitySignalRatio`

The important design point is that downstream features continue to consume persisted normalized resource data instead of branching per Canvas source type.

---

## Compatibility and quality matrix

### Supported and commonly high-quality

- PDF with real text
- PPTX with readable slide text
- DOCX
- TXT, Markdown, CSV, and HTML files
- Canvas Pages with readable page body
- Canvas Assignments with readable description or instructions
- Canvas Discussions with readable prompt or body

These sources can still land as `usable` instead of `strong` if the extracted text is structurally light.

### Supported but often weak or partial

- Scanned or image-only PDFs
- DOCX, PPTX, or PDF extractions that technically parse but surface thin text
- Canvas Pages, Assignments, or Discussions whose stored body is minimal or empty
- Older module resources whose stored source URL still exists but no longer returns a strong readable payload

These sources may be technically readable enough to persist text, but Phase 3 now grades them as `weak` or `empty` instead of treating them like normal study material.

### Linkable but not readable

- External URLs
- External tools
- Module subheaders and non-content module items

These remain routeable and inspectable, but they stay `unsupported` in the shared study pipeline.

### Unsupported

- Unknown binary file types
- Legacy `.ppt`

### Failed or auth-blocked

- Protected Canvas resources whose stored reprocess URL now needs server-side auth
- Stored source URLs that no longer resolve
- Any extractor run that returns a hard fetch or parser failure

Failed or auth-blocked items remain inspectable, and the inspect view now shows the exact stored failure reason instead of flattening them into a generic weak state.

### Quality classifications

- `strong`: strong enough for grounded Learn and Quiz use
- `usable`: real study material, but lighter or noisier than the strongest sources
- `weak`: text exists, but it is too thin or noisy to trust as strong grounding
- `empty`: no usable study text surfaced
- `unsupported`: link-only or unreadable source type
- `failed`: extraction or reprocess failed, including auth-blocked fetches

---

## Known limitations and follow-up work

- No dedicated announcements table yet. Announcements are still derived from synced module content.
- Review is still a redirect to Learn rather than a separate review workspace.
- Reprocessing depends on stored source URLs. It cannot invent missing Canvas API links for older rows.
- Incremental course resync is still limited. Some older rows may still benefit from a fresh sync after extractor upgrades.
