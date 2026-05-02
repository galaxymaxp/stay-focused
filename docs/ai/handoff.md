# Stay Focused — AI Session Handoff

Author: galaxymaxp omgraythekid@gmail.com
Last Updated: 2026-05-02

## Session Type

Documentation-only session (no runtime behavior changes, no schema changes, no route renames).

## What Changed This Session

- Added `docs/ai/implementation_plan.md` with an implementation-ready schedule-first rollout plan.
- Rewrote `AGENTS.md` into an operational manual for AI coding sessions.
- Updated `README.md` overview and product framing to reflect schedule-first command-center direction.
- Updated this handoff with canonical direction, rationale, and next steps.

## Why It Changed

The repository needed implementation-ready context for the new schedule-first direction, plus stronger process discipline to prevent stale docs, context drift, and unfocused implementation passes.

## Canonical Product Direction (Current)

Stay Focused is a **schedule-first student productivity app over Canvas**.

The primary product question is: **“What should I do next with the time I have available?”**

Priority hierarchy:

1. Schedule / Today Plan
2. Calendar (deadline/event feeder)
3. Tasks
4. Deep Learn / Review / Quiz
5. Do Draft / Outputs

Additional direction:

- Calendar is not the main command center.
- Deep Learn/Review/Quiz/Do Draft should activate from scheduled blocks.
- Study Library remains the persistent output repository.
- AI should reduce overwhelm and speed execution.

## Next Recommended Coding Steps

1. Implement Phase 1 from `docs/ai/implementation_plan.md`: reframe `/` into a Today Plan-first command center using existing components.
2. Add explicit “Next Block” + available-time framing on the home surface with minimal architecture disruption.
3. Validate hierarchy in UI copy and layout so calendar remains secondary.
4. Run lint/typecheck and document outcomes in the next handoff.

## Risks / Blockers

- Existing home composition may still bias toward dashboard-style scanning over direct next-action execution.
- Calendar-first legacy patterns may persist in labels/content order without intentional cleanup.
- Scheduler trust depends on visible logic around priority/time-fit and reliable Canvas-fed deadlines.

## Verification Status for This Session

- Planned to run `npm run lint` and `npm run typecheck` for documentation touch validation.
- If either check fails due to unrelated pre-existing issues, record details in the next implementation handoff.

## Maintenance Rule

After every coding session, update this file before final handoff so current direction, changes, and risks remain explicit.

---

## Session Update — 2026-04-30 (Phase 1 scheduler foundation)

### What changed
- Added Supabase migration for `scheduled_blocks` plus schedule/scoring fields across `tasks`, `task_items`, `deadlines`, `modules`, `module_resources`, and `learning_items`.
- Added scheduler foundation modules:
  - `lib/scheduler/types.ts`
  - `lib/scheduler/priority.ts`
  - `lib/scheduler/estimation.ts`
  - `lib/scheduler/algorithm.ts`
- Added scheduler server actions:
  - `generateUserSchedule(freeTimeStart, freeTimeEnd)`
  - `updateBlockStatus(blockId, status)`
  - `rescheduleBlock(blockId, start, end)`
- Added scheduler-focused tests for scoring, estimation, generation, status transitions, preservation behavior, and metadata-only confidence behavior.

### Why it changed
To implement the Phase 1 backend foundation for schedule-first planning while preserving existing Today UI and keeping block state user-controlled.

### Scoring formula summary
- `schedule_priority_score = importance*0.35 + urgency*0.45 + difficulty*0.10 + freshness*0.10`.
- Urgency strongly boosts overdue and near-due work.
- Announcements/references are intentionally down-weighted versus deliverables.

### Estimation rules summary
- Reuse existing estimates when present (high confidence).
- Overdue work gets catch-up estimate.
- Quizzes/exams due soon get larger prep allocation.
- Coding/report style tasks get larger workload baseline.
- Long readable resources estimate from extracted text length.
- Metadata-only/unreadable resources get low-confidence short estimates.
- Modules with no due date get a moderate default review block.

### Scheduler limitations (current)
- Regeneration only replaces future `scheduled` blocks (`start_at >= now`); opened/completed/skipped and past scheduled blocks are preserved.
- No auto-skip behavior.
- Missed status is lazy/on-read logic (utility-based), no cron required.
- No drag clock UI yet and no full Today UI replacement.
- Scoring failures are isolated from Canvas sync/page load path (scheduler logs/returns safely on fetch issues).

### Next recommended step
Build the Clock Command Center UI shell on top of persisted `scheduled_blocks` (still without draggable interactions).

### Risks / blockers
- Current schedule source set is intentionally narrow (task items/modules/resources) to keep rollout low-risk.
- No background missed-state sweep (by design due to Vercel Hobby cron constraints).
- Tuning weights may need calibration after real user data.

### Session type
Implementation session (runtime + schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center UI shell)

### What changed
- Replaced the legacy Today dashboard shell with a schedule-first Clock Command Center structure in `TodayDashboard`.
- Added required sections in the approved hierarchy:
  - Current / Next Block hero
  - Need Attention (lazy missed scheduled blocks)
  - Compact Clock visual shell (ring/list hybrid)
  - Coming Up list
  - Supporting links
- Wired Generate/Regenerate schedule action through the existing `generateUserSchedule` server action.
- Added block status actions for Start/Open, Complete, Skip, plus a placeholder reschedule trigger using existing action wiring.
- Updated home entry points (`app/page.tsx` and `app/(app)/page.tsx`) to fetch persisted `scheduled_blocks` and feed the new dashboard shell while preserving existing due-soon/course data flows.
- Added new UI-only styles in `app/globals.css` for command-center layout, mobile-first ordering, and desktop two-column shell (clock left, details right).

### Why it changed
To implement Phase 1’s schedule-first home shell quickly and safely without overbuilding interactions (no drag handles, no cron, no complex animation), while keeping existing data pipelines intact.

### Current product direction
Home now prioritizes schedule execution flow first (what to do now, what was missed, what is next), with calendar/tasks/courses as supporting pathways.

### Next recommended steps
1. Add source-aware deep links per scheduled block (task/module/resource destination routing).
2. Improve clock shell fidelity (optional true arc rendering with tested math) only after UX validation.
3. Add explicit missed badge/status derivation in server query layer for consistency across surfaces.
4. Add lightweight user-configurable schedule window for generation (instead of fixed 08:00–22:00).

### Risks / blockers
- Current reschedule button is intentionally placeholder-level (passes through existing action with unchanged times).
- Some scheduled block source types still need richer contextual drill-through.
- Full test suite currently has unrelated pre-existing PDF extraction test failures (`Promise.try` / extraction expectations).

### Verification status
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test` ran; 5 pre-existing PDF extraction-related tests failed (details in terminal output).

### Session type
Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center polish + empty states)

### What changed
- Added critical schedule empty states in `TodayDashboard`:
  - no schedule generated yet
  - no Canvas/task source data available
  - short-time/no-meaningful-plan guidance
  - all scheduled blocks completed success state
- Added trust microcopy layer on block rows/cards with small muted estimate-origin labels.
- Improved current-block clarity:
  - explicit “Current Block” vs “Next up” labeling
  - remaining-time indicator
  - urgency emphasis styling on active block
- Improved Need Attention and Coming Up usability:
  - missed blocks sorted by urgency/time
  - “missed and need your decision” framing copy
  - Coming Up capped to 3 with subtle priority dot/tone
- Improved generation UX:
  - generation button disables while running
  - loading state copy now “Building your plan…”
  - post-generation scroll to current block section
- Added CSS refinements to reduce layout shift, improve mobile spacing, and keep visual hierarchy clear between high-priority and supporting cards.

### Why it changed
To improve clarity, trust, and execution confidence in the Clock Command Center without introducing major feature scope (no drag clock, no cron, no route changes).

### Current product direction
Continue iterating the schedule-first command center so students can quickly decide and act on the next best block with minimal overwhelm.

### Next recommended step
Add source-aware deep links from each schedule block into its exact task/module/resource destination while keeping command-center visual hierarchy stable.

### Risks / blockers
- “Free-time too short” currently appears when a schedule exists but no active/next actionable block remains; true free-window inference still depends on future schedule-window settings.
- Post-generation scroll depends on client-side state update timing and may feel subtle when schedule is unchanged.

### Verification status
- `npm run typecheck` passed.
- `npm run lint` passed.

### Session type
Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Dev demo schedule preview for Today)

### What changed
- Added a temporary **dev-only** demo schedule toggle in `TodayDashboard` that appears as a subtle control (`Preview demo schedule`) when there is no meaningful active plan context.
- Implemented local in-memory demo blocks (no database writes) to populate Clock Command Center states:
  - active/current block
  - next up
  - coming up items
  - missed item for Need Attention
  - completed item
  - skipped item (supported status)
- Enriched block rendering for preview realism with optional context + urgency/deadline-basis notes.
- Refined empty-state behavior:
  - removed duplicate generate CTA from the empty card
  - added “Start here” fallback with three secondary placeholder actions
  - updated passive empty copy to stronger guidance
  - kept Coming Up guidance aligned with generation flow

### Why it changed
The command center looked visually polished but functionally dead when no blocks existed. This adds a safe preview path for UI validation and mobile checks without requiring Canvas sync timing or generated persisted blocks.

### Guarding details
- Demo control is guarded by `process.env.NODE_ENV !== 'production'` and only shown in low-schedule contexts.
- Demo data is local component state only; it does not write to Supabase.
- Status/reschedule server actions are disabled while demo mode is active.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.

### Risks / blockers
- Demo toggle is intentionally temporary and local to `TodayDashboard`; future refactors should remove or replace it once command-center confidence testing is complete.
- Visual verification at exact 390px / 430px widths was not run with browser automation in this session (tooling not invoked).

### Next recommended step
- Add lightweight Playwright viewport checks (390px and 430px) for both no-schedule and demo-schedule states, then remove the temporary demo control after design sign-off.

### Session type
Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Today empty-state shell + mobile setup controls)

### What changed
- Updated `TodayDashboard` empty-state flow so the Clock Command Center shell always renders first after title, including when there are zero schedule blocks.
- Replaced the prior empty-state generate placement with an in-card setup section that includes visible start/end time inputs plus an available-duration summary.
- Wired generate action to selected local time window (`generateUserSchedule(availableStart, availableEnd)`) instead of fixed `08:00–22:00`.
- Moved primary “Generate Today Plan” button into setup card when no schedule exists; retained “Building your plan…” pending copy.
- Added guarded demo preview control directly in setup card and expanded guard behavior to allow explicit enablement in production-like previews.
- Prevented broken empty current-block presentation by showing meaningful guidance when no current/next block exists.
- Kept Need Attention empty message calm and removed Coming Up section in no-schedule state.
- Updated compact clock empty shell copy to: “Available time”, “No blocks yet”, “Set your time, then generate”.
- Added styling for mobile-first order and setup controls.

### Demo preview env guard
- Demo preview is shown when either:
  - `process.env.NODE_ENV !== 'production'`, **or**
  - `process.env.NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'`.
- This keeps it visible for local dev/test and optionally for Vercel preview/manual QA via explicit opt-in flag.

### Free-time control wiring status
- Start/end controls are currently **local client state** in `TodayDashboard`.
- They are now directly passed into the server generation action on submit.
- Persistence of preferred window beyond current page lifecycle is not yet implemented.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- Manual browser viewport verification at exact 390px/430px was **not automated** in this session.

### Remaining risks / blockers
- Available-time selections are not persisted per user yet.
- No hard validation message beyond disabling generate on invalid range.
- Exact mobile rendering at 390px and 430px still needs explicit visual QA/screenshot validation.

### Session type
- Implementation session (runtime UI changes, no schema changes).

## Session Update — 2026-04-30 (Today planner-surface redesign)

### What changed
- Refactored `TodayDashboard` into a unified planner surface (`today-command-center` + `planner-shell`) instead of stacked cards.
- Reordered mobile flow so the clock/planner visual is first after title, followed by time controls/generate buttons, then timeline.
- Moved generate/regenerate control into the planner clock column and removed standalone header CTA.
- Implemented a cleaner clock-face visual with 12/3/6/9 markers, free-time label, and NOW chip when active block exists.
- Reworked right column into a vertical timeline with explicit row time labels, block state styling (`is-now`, `is-missed`, `is-completed`, `is-skipped`), and inline actions (Start/Complete/Skip/Later).
- Added no-block timeline empty state copy: “No blocks yet” + “Set your time, then generate your plan.”
- Kept Need Attention below the timeline in a compact panel and moved Start Here fallback below planner surface.
- Preserved dev/demo preview guard (`NODE_ENV !== production || NEXT_PUBLIC_ENABLE_DEMO_SCHEDULE === 'true'`) and added in-UI note for Vercel preview env flag usage.
- Added extra Today page bottom padding through planner container to avoid mobile bottom-nav overlap with generate/setup controls.

### Responsive behavior
- Desktop/wide: two-column planner shell with sticky left clock/control column and right timeline column.
- Mobile: single unified stack ordered as title → clock → free-time controls/buttons → timeline → need attention → start here fallback.
- Time inputs remain in a constrained 2-column grid with full-width input controls to avoid overflow.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.

### Remaining risks / blockers
- No browser automation screenshot verification was executed in this session for exact 390px and 430px widths.
- Clock remains static visual (intentional for this phase); no drag/drop or real arc scheduling interactions were introduced.
- “Later” action remains placeholder wiring to existing reschedule action with unchanged times.

### Session type
- Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center schedule-window sync)

### What changed
- Added shared scheduler time helpers in `lib/scheduler/time.ts`:
  - `timeToMinutes`
  - `minutesToTime`
  - `formatTime`
  - `formatDuration`
  - `isBlockInsideWindow`
- Updated `TodayDashboard` to derive `visibleSchedule` by filtering schedule blocks against the selected free-time start/end window before calculating:
  - current block
  - timeline blocks
  - Need Attention blocks
  - completed/all counts
  - inner clock schedule ring segments
- Updated the clock visual so the outer free-time arc and inner planned-block ring are generated from the same selected window and filtered blocks.
- Normalized `HH:mm` time input into same-day ISO timestamps before schedule generation, with the server action also accepting either `HH:mm` or ISO input defensively.
- Added focused scheduler tests for time helpers and window filtering.

### Why it changed
The selected free-time window and visible schedule had drifted apart. A user could choose a morning window such as 5:45 AM to 8:45 AM while the Today schedule still displayed afternoon or evening blocks. The command center now hides blocks that do not fit inside the selected window for this pass.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx tsx --test tests/scheduler.test.ts` passed.

### Remaining risks / blockers
- This pass filters out-of-window blocks instead of automatically rescheduling them.
- Cross-midnight free-time windows are still treated as invalid.
- Full browser screenshot verification at exact mobile widths was not run in this session.

### Session type
- Implementation session (runtime UI changes, no schema changes).

---

## Session Update — 2026-04-30 (Clock Command Center layout restoration)

### What changed
- Restored the Clock Command Center as a polished two-column planner card:
  - left column for clock visual, legend, time controls, duration, and plan actions
  - right column for Today's Schedule, Need Attention, and Start Here
- Replaced fragile literal clock marker text with a fixed-size SVG clock visual so marker text cannot collapse into debug-looking output such as `12369`.
- Preserved the schedule/free-time synchronization logic from the previous pass:
  - `visibleSchedule`
  - shared scheduler time helpers
  - filtering blocks inside the selected free-time window
  - filtered inner clock ring data
- Added stale-window UI behavior when start/end controls change.
- Updated schedule cards with dot, title, formatted time range, duration, and compact actions.
- Updated the empty state to explain when no blocks fit the selected time window.

### Files touched
- `components/TodayDashboard.tsx`
- `app/globals.css`
- `docs/ai/handoff.md`

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npx tsx --test tests/scheduler.test.ts` passed.

### Browser verification notes
- The local home route currently shows the sync-first empty state because this environment has no synced workspace data.
- Used a temporary local verification route with fixture schedule data, then removed it before finalizing.
- Desktop verification confirmed:
  - clock visible with non-zero dimensions (`391x280`)
  - two-column layout (`420px` left column plus remaining right column)
  - no `12369` text
  - out-of-window fixture block hidden
  - no framework error overlay or console errors
- Mobile verification at `390px` confirmed:
  - clock stacks above schedule
  - no horizontal overflow
  - clock remains visible with non-zero dimensions
- Changing the window to `05:45`-`08:45` showed the expected empty state and no schedule cards.

### Remaining risks
- Browser verification used fixture data because the local signed-out/sync-empty state cannot mount the real Today dashboard.
- Automatic rescheduling is still out of scope; out-of-window blocks are filtered.
- Cross-midnight free-time windows are still invalid.

### Next recommended step
Run the same browser checks against an authenticated/synced workspace or seeded local data, then add a small regression test harness for the Today dashboard states.

---

## Session Update - 2026-05-02 (Scanned PDF OCR gating for Deep Learn)

### What changed
- Tightened PDF extraction so image-only PDFs and below-threshold image-heavy extracts are classified as OCR-required instead of usable text.
- Added page-level OCR metadata support in `lib/extraction/pdf-ocr.ts` and persisted it through `buildOcrCompletedUpdate`.
- OCR completion now mirrors recovered text into `module_resources.extracted_text`, preview, and char count only when useful text exists.
- OCR failure/no-text now leaves normal extraction status as `empty` while marking `visual_extraction_status = failed`.
- Disabled Deep Learn scan fallback generation from binary files; selected resources must have stored extracted text or completed visual text before generation.
- Updated Deep Learn prompt grounding to exclude module summaries, linked context, assignment metadata, deadlines, and other stale course/module facts.
- Updated image-based PDF UI copy to: `This PDF appears to be image-based. Run visual extraction first.`

### Why it changed
Scanned PDFs with no parsed text could still trigger Deep Learn output from stale surrounding context. The new flow blocks generation until OCR/visual extraction produces real page text for the selected resource.

### Tests added/updated
- Image-only PDFs remain not ready until OCR completes.
- Empty selected resources block Deep Learn and do not use stale module/course context.
- Completed OCR makes the resource ready and stores page-level metadata.
- Prompt grounding uses selected resource extracted text and excludes stale ERP/SAP/Gym Badge-style context.

### Verification results
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.

### Risks / next steps
- OpenAI OCR still depends on the model returning page labels (`Page 1:` etc.); unlabeled output is stored as page 1.
- The exact 20-page `1.1-Data Organization.pdf` fixture was not present in-repo, so coverage uses synthetic image-only PDFs plus Deep Learn grounding tests around the expected Data Organization terms.
- Next step: run OCR against the real Canvas/stored PDF and confirm extracted page text includes Data Organization, OLTP, ODS, Subject-Oriented, Integrated, Current Valued, and Volatile, with no ERP/SAP/Gym Badge leakage.

### Session type
- Implementation session (runtime extraction/readiness/generation changes, no schema changes).

---

## Session Update - 2026-05-02 (Real-file scanned PDF validation)

### What changed
- Added [`scripts/validate-scanned-pdf.ts`](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) for repeatable local validation against a real scanned/image-only PDF.
- The validator loads `.env.local`, runs the normal PDF parser, checks pre-OCR Deep Learn readiness/UI copy, attempts OpenAI OCR, falls back to local rendered-page OCR for validation when needed, then verifies post-OCR readiness plus source-only Deep Learn generation.

### Real-file result
- Validated against local file: `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`
- Normal parsing returned `empty` with `pdf_image_only_possible`.
- Pre-OCR resource was `unreadable`, not Deep Learn-ready.
- Pre-OCR UI copy matched exactly:
  `This PDF appears to be image-based. Run visual extraction first.`
- Rendered-page OCR validation recovered the expected source terms, including:
  `DATA ORGANIZATION`, `OLTP`, `Online Transaction Processing`, `ODS`, `Operational Data Store`, `Subject-Oriented`, `Integrated`, `Current Valued`, `Volatile`
- Deep Learn generation using the OCR-backed selected resource passed the stale-context check and did not emit `ERP`, `SAP Learning Hub`, or `Gym Badge` as unrelated fallback context.

### Important risk discovered
- The current OpenAI PDF OCR path did not reliably transcribe this real file. In repeated runs it returned refusal/too-short text such as:
  `I'm unable to transcribe text from images or PDFs...`
- The validator therefore used rendered-page local OCR as a validation fallback only. This means the guardrail is correct, but the production OCR path still needs a stronger rendered-page extraction implementation for real scanned slide decks.

### Verification results
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.

### Next step
- Replace or augment the current OpenAI PDF-file OCR call with rendered-page vision extraction inside the app pipeline, then rerun the same validator and remove the validation-only fallback distinction.

---

## Session Update - 2026-05-02 (Production rendered-page OCR for scanned PDFs)

### What changed
- Replaced the scanned PDF OCR adapter in [lib/extraction/pdf-ocr.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extraction/pdf-ocr.ts) so production OCR now renders PDF pages to images first and sends rendered page images to the vision model.
- Added direct runtime dependency on `@napi-rs/canvas` so `unpdf` can render pages server-side in Node.
- OCR now runs page-by-page with bounded rendering and retries:
  - max pages per run: default `24` (`OPENAI_OCR_MAX_PAGES`)
  - first render width: default `1800`
  - retry render width for empty/failed pages: default `2400`
- Page-level OCR metadata now stores:
  - page number
  - extracted text
  - char count
  - status (`completed` / `empty` / `failed`)
  - provider/model
  - refusal flag
  - page-level error
  - attempts
  - rendered image dimensions
- OCR merge still writes usable text into `module_resources.extracted_text`, preview, and char count only when enough useful text exists.
- Updated [scripts/validate-scanned-pdf.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) to use the same production OCR path instead of the old validation-only offline fallback.

### Real-file result
- Production rendered-page OCR validated against local file:
  `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`
- Pre-OCR behavior remained correct:
  - normal parse returned `empty`
  - `pdf_image_only_possible`
  - Deep Learn readiness stayed blocked
  - UI copy matched:
    `This PDF appears to be image-based. Run visual extraction first.`
- Production OCR recovered the expected terms from rendered pages:
  `DATA ORGANIZATION`, `OLTP`, `Online Transaction Processing`, `ODS`, `Operational Data Store`, `Subject-Oriented`, `Integrated`, `Current Valued`, `Volatile`
- Real-file validator passed using the production path, and Deep Learn generation stayed grounded in the selected OCR text without leaking stale module/course context.

### Remaining risks
- OCR currently caps processing to the first `24` pages per run by default. This worked for the real slide deck because the required material appeared early, but longer scanned PDFs may need a follow-up pass or a higher configured page cap.
- Page-level confidence is still `null` because the OpenAI vision response does not expose OCR confidence scores.
- The adapter is intentionally conservative: partial page failures are recorded in metadata, but the resource is only marked completed when the merged OCR text is useful overall.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.

### Next step
- Add a resumable follow-up OCR path for truncated scanned PDFs so page ranges beyond the first run can be processed without redoing already successful pages.

---

## Session Update - 2026-05-02 (Deep Learn source-text quality gate for OCR refusal and metadata)

### What changed
- Added shared extracted-text classification in [lib/extracted-text-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extracted-text-quality.ts) with these outcomes:
  - `meaningful`
  - `too_short`
  - `refusal`
  - `metadata_only`
  - `boilerplate`
  - `empty`
- Deep Learn readiness now uses that classifier instead of treating any non-empty OCR string as usable text.
- OCR completion in [lib/source-ocr-updates.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/source-ocr-updates.ts) now:
  - classifies each OCR page
  - merges only usable page text
  - refuses to mirror refusal/metadata/boilerplate text into `extracted_text`
  - stores refusal/error state in metadata only
  - keeps `extraction_status = empty` and `visual_extraction_status = failed` when OCR did not recover meaningful study text
- Deep Learn prompt grounding in [lib/deep-learn-generation.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-generation.ts) now strips prompt-side resource metadata that could become fake study material:
  - removed resource UUID/id from the grounding block
  - removed quality-note/source-warning text from the factual grounding block
  - preserved only selected-resource source text as grounding
- Saved Deep Learn pack UI in [lib/deep-learn-ui.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-ui.ts) now blocks packs whose `sourceGrounding.sourceTextQuality` is not `meaningful`, or whose source grounding is obviously insufficient.
- Learn resource UI and source-readiness checks now use the same quality gate so OCR refusal text does not surface as reader-ready content.
- Real-file validator in [scripts/validate-scanned-pdf.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) now fails if production OCR returns only refusal/metadata text but still appears Deep Learn-ready.

### Why it changed
- A scanned PDF OCR refusal such as `I'm unable to transcribe text from images or scanned documents at this time...` could still be stored as extracted content and then turned into a Deep Learn pack containing document titles, UUIDs, and extraction notes.
- The new gate forces Deep Learn to wait for meaningful academic text and blocks metadata-shaped or refusal-shaped OCR output from becoming study material.

### Blocked message
- The OCR/no-usable-text path now uses:
  `Visual extraction did not find enough usable study text. Try OCR again or open the original source.`

### Real-file validation result
- Re-ran the production validator against:
  `C:\Users\omgra\Downloads\1.1-Data Organization.pdf`
- Result:
  - pre-OCR parse stayed `empty` / `pdf_image_only_possible`
  - pre-OCR Deep Learn stayed blocked
  - pre-OCR UI copy stayed:
    `This PDF appears to be image-based. Run visual extraction first.`
  - production rendered-page OCR recovered meaningful source text
  - validator confirmed expected terms including:
    `DATA ORGANIZATION`, `OLTP`, `Online Transaction Processing`, `ODS`, `Operational Data Store`, `Subject-Oriented`, `Integrated`, `Current Valued`, `Volatile`
  - Deep Learn generation stayed grounded in selected-resource OCR text and did not leak `ERP`, `SAP Learning Hub`, or `Gym Badge`

### Tests added/updated
- Refusal text is not Deep Learn-ready.
- Metadata-only OCR text is not Deep Learn-ready.
- UUID/title-only OCR text is not Deep Learn-ready.
- OCR refusal is stored as metadata/error, not mirrored into `extracted_text`.
- Valid Data Organization OCR text is Deep Learn-ready.
- Saved Deep Learn packs with bad source grounding are blocked in the UI.
- Learn resource UI does not surface OCR refusal text as ready reader content.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.

### Remaining risks
- The classifier is heuristic. It is tuned to reject refusal/metadata/UUID-heavy OCR output, but extremely short legitimate slides can still depend on adjacent pages to cross the meaningful-text threshold.
- OCR still processes only the first `24` pages per run by default, so longer scanned decks may need a resumable follow-up pass before the source becomes fully grounded.

### Next step
- Add resumable page-range OCR so long scanned PDFs can accumulate meaningful text across multiple runs without reprocessing already successful pages.

---

## Session Update - 2026-05-02 (Deep Learn preview regression: metadata/debug grounding removal)

### What changed
- Removed metadata/debug fields from the actual model grounding prompt in [lib/deep-learn-generation.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-generation.ts). The model no longer receives these as study content:
  - file title
  - source type
  - module name
  - course name
  - extraction quality
  - source text quality
  - grounding strategy
  - AI fallback status
  - scanned-image transcription status
  - resource id / UUID-like identifiers
- The prompt now sends only the selected resource source text after it passes the meaningful-text gate.
- Strengthened [lib/extracted-text-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extracted-text-quality.ts) so refusal/fallback text is rejected even when mixed with metadata/debug labels.
- Added a harder server-side generation gate:
  - blocks when source text quality is not `meaningful`
  - blocks refusal phrases
  - blocks metadata-heavy label/debug text
  - blocks low academic-keyword-density text
- Saved Deep Learn packs are now treated as invalid in [lib/deep-learn-ui.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-ui.ts) if either:
  - their persisted source grounding is bad, or
  - their generated answers/prompts are visibly metadata/debug-grounded

### Preview regression fixed
- Failing preview input:
  - refusal sentence like:
    `I'm unable to transcribe text from images or scanned documents at this time...`
  - plus labels like:
    `File title`, `Source type of the file`, `Module name`, `Course name`, `Extraction quality reported`, `Source text quality reported`, `Grounding strategy used`, `Was an AI fallback used to supply text?`, `Was the PDF text transcribed from scanned images?`
- New behavior:
  - `sourceTextQuality` is not `meaningful`
  - resource is not ready
  - Deep Learn generation is blocked
  - saved pack is blocked as invalid if it already exists
  - UI uses:
    `Visual extraction did not find enough usable study text. Try OCR again or open the original source.`

### Tests added/updated
- Refusal text mixed with metadata labels is not Deep Learn-ready.
- Prompt assembly does not inject metadata/debug labels into model grounding.
- Metadata/debug grounded saved packs are blocked in the UI.
- Metadata-heavy refusal previews do not show ready.
- Positive OCR grounding still passes for Data Organization / OLTP / ODS / Subject-Oriented / Integrated / Current Valued / Volatile.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed.

### Remaining risk
- The academic-keyword-density gate is heuristic. It correctly blocks the known refusal/metadata preview regression and still accepts the real Data Organization deck, but very short legitimate slides may still need neighboring-page OCR text to clear the threshold.

---

## Session Update - 2026-05-02 (Scanned PDF OCR queue UX)

### What changed
- Added `source_ocr` as a first-class queued job type in [lib/queue.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/queue.ts).
- Added source OCR queue helpers in [lib/source-ocr-queue.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/source-ocr-queue.ts) for:
  - queue title: `Preparing scanned PDF: ...`
  - progress from processed pages / total pages
  - status messages like `Scanning page 8 of 51`
  - active duplicate detection
  - recent failed-job guard for automatic retries
- Reworked [components/OcrSourceButton.tsx](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/components/OcrSourceButton.tsx) to enqueue OCR via `queueSourceOcrAction` instead of calling the synchronous OCR route directly.
- Added `queueSourceOcrAction` and queued OCR processing in [actions/queue-jobs.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/actions/queue-jobs.ts):
  - duplicate active OCR jobs are blocked server-side
  - recent failed OCR jobs are not auto-enqueued again unless the user manually retries
  - resources are marked `visual_extraction_status = queued` before processing
  - rendered-page OCR updates queue progress after each page
  - successful OCR mirrors meaningful text into normal extraction fields
  - failed/thin/refusal OCR keeps Deep Learn blocked
- [components/shell/QueuePanel.tsx](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/components/shell/QueuePanel.tsx) now displays OCR jobs in the Study Queue with OCR-specific titles, progress, completion, and failure wording.
- Learn resource readiness now has clearer OCR states:
  - `visual_ocr_queued`
  - `visual_ocr_running`
  - `visual_ocr_partial`
  - `visual_ocr_completed_empty`
  - `visual_ocr_failed`
- The Learn accordion auto-enqueues OCR for image-only/OCR-required resources and no longer shows `Prepare scanned PDF` next to `OCR is already complete.`
- OCR button labels now map to state:
  - needed: `Prepare scanned PDF`
  - running/queued: queue/status copy instead of a conflicting button
  - partial: `Continue OCR`
  - failed/thin: `Retry OCR`
  - meaningful OCR text: normal Deep Learn generation

### UX behavior
- OCR queued:
  `Scanned PDF preparation is queued. Deep Learn will unlock after readable text is found.`
- OCR running:
  `Scanning page 8 of 51`
- OCR completed but thin:
  `Visual extraction finished, but did not find enough usable study text. Try OCR again or open the original source.`
- OCR failed/refused:
  `Visual extraction failed or returned non-usable text. Try OCR again or open the original source.`

### Tests added/updated
- OCR queued state does not claim OCR is complete.
- OCR running state shows page progress.
- OCR completed with thin text stays blocked with retry guidance.
- OCR queue helpers cover titles, progress, duplicate active jobs, and recent failed auto-retry suppression.
- OCR completed update now records actual pages processed from OCR results instead of assuming the full PDF page count.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed:
  - pre-OCR parse was `empty` / `pdf_image_only_possible`
  - pre-OCR readiness was `unreadable`
  - pre-OCR UI copy was `This PDF appears to be image-based. Run visual extraction first.`
  - production rendered-page OCR recovered `3400` characters across `24` pages
  - expected Data Organization / OLTP / ODS terms passed
  - Deep Learn generation check passed

### Remaining risks
- The queued OCR worker currently runs through the app's existing `after(...)` queue pattern. It is integrated with the queue UI, but it is still bounded by the hosting/runtime limits of that background execution path.
- Resume/continue OCR is represented in the UI state, but the OCR engine still processes from page 1 up to the configured max pages. True page-range resume remains a follow-up.

### Next step
- Add resumable page-range OCR so `Continue OCR` can scan only unprocessed pages and append usable text instead of rerunning the first page batch.

---

## Session Update - 2026-05-02 (OCR persistence/readiness identity fix)

### What changed
- Fixed source text selection so stale or thin `extracted_text` no longer masks richer completed `visual_extracted_text`.
  - [lib/extracted-text-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/extracted-text-quality.ts) now evaluates extracted text, visual OCR text, and preview text, then chooses meaningful text when any candidate is meaningful.
  - [lib/deep-learn-readiness.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/deep-learn-readiness.ts) now selects the longest meaningful grounding text from those same candidates.
  - [lib/module-resource-quality.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/module-resource-quality.ts) now includes completed visual OCR text when computing resource quality and "meaningful characters."
- OCR completion in [lib/source-ocr-updates.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/lib/source-ocr-updates.ts) now persists:
  - full merged useful OCR text into `extracted_text`
  - the same useful text into `visual_extracted_text`
  - full merged OCR length into `extracted_char_count`
  - actual PDF page count from rendered-page OCR metadata into `page_count`
  - `pdfOcr.totalMergedCharCount` for diagnostics
- [scripts/validate-scanned-pdf.ts](/c:/Users/omgra/OneDrive/Documents/Projects/stay-focused/scripts/validate-scanned-pdf.ts) now prints persistence/readiness diagnostics and supports optional DB row inspection with `--resource-id`.
- Same-title duplicate protection was covered at the queue identity layer: OCR duplicate detection keys by resource id, not title.

### Regression covered
- A resource with stale/thin `extracted_text` such as `DATA ORGANIZATION OLTP ODS.` and meaningful completed `visual_extracted_text` now becomes Deep Learn-ready.
- Data Organization OCR text with OLTP / ODS / Operational Data Store persists thousands of characters and becomes `sourceTextQuality = meaningful`.
- Same-title PDF queue jobs do not block or target another resource id.

### Real-file validation
- Ran:
  `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"`
- Result:
  - OCR completed with `3404` characters across `24` rendered pages
  - merged persisted text length: `3137`
  - `extracted_char_count`: `3137`
  - `sourceTextQuality`: `meaningful`
  - readiness: `text_ready`
  - `canGenerate`: `true`
  - Deep Learn generation check passed
- Also ran the mentioned fixture:
  `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization (2).pdf"`
- Result:
  - OCR completed with `3415` characters across `24` rendered pages
  - merged persisted text length: `3137`
  - `extracted_char_count`: `3137`
  - `sourceTextQuality`: `meaningful`
  - readiness: `text_ready`
  - `canGenerate`: `true`

### Note on page count
- The validator detected `51` PDF pages for both local files through the production PDF renderer, while OCR processed the configured first `24` pages. That means the app's `51 pages detected` value matches the actual PDF object as seen by the renderer, even though the deck may visually appear to have fewer slide pages.

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` passed.

### Remaining risks
- If the live app already has rows with stale failed OCR status plus good text in only one field, those rows may need a retry or a one-time repair script to recompute `extracted_char_count`, metadata quality, and statuses from the stored visual text.

---

## Session Update - 2026-05-02 (Automatic scanned PDF OCR during Canvas sync)

### What changed
- Canvas sync now auto-enqueues `source_ocr` jobs after inserting `module_resources` for scanned/image-heavy PDF candidates.
  - Candidate detection covers image-only PDF signals, `pdf_image_only_possible`, empty/metadata-only PDF extraction, and thin readable text.
  - Duplicate prevention keys by exact `resourceId` and active `pending`/`running` jobs.
  - Recent failed OCR jobs suppress automatic retries so resync does not spam the queue.
- Queue creation now has a service-role path for server-side sync/background work with structured, non-secret error logging.
- Added migration `20260502010000_add_source_ocr_queue_type.sql` for the missing `source_ocr` queued job enum value.
- The queued OCR worker is exported and started from the Canvas sync queue path immediately after a course sync creates OCR jobs.
- Student-facing scanned PDF copy now treats OCR as automatic:
  - `Preparing scanned PDF for Deep Learn...`
  - `Scanned PDF is queued for text extraction.`
  - `Scanning pages for readable text...`
  - failed/thin states tell the student to open the original source, with retry kept as a secondary action.
- Removed the hidden client-side auto-click OCR path from the Learn accordion.
- Validator diagnostics now print queue job id/status and the auto-enqueue decision reason when validating a DB resource.

### Queue behavior
- `source_ocr` jobs appear in Study Queue with titles like `Preparing scanned PDF: 1-Data Organization.pdf`.
- Running queue status uses page progress when available, for example `Scanning page 8 of 51`.
- Completion/failure revalidates the module Learn, Review, Quiz, course, library, and resource detail paths.

### Remaining risks
- Direct non-queued sync still creates OCR jobs, but the immediate worker start is wired through the queued Canvas sync path.
- OCR still processes from the first rendered page batch; true page-range resume remains future work.
- Existing production databases need the new enum migration before `source_ocr` inserts can succeed.

### Manual validation steps
- Sync a course with an image-only PDF and confirm the resource moves to `Preparing`/`OCR queued` without a primary `Prepare scanned PDF` action.
- Open Study Queue and confirm the `source_ocr` job appears with the scanned PDF title and page progress.
- After OCR completes, refresh the Learn page and confirm the resource moves to Ready with `Generate study pack`.
- Run DB diagnostics when needed:
  `npx tsx scripts/validate-scanned-pdf.ts --resource-id <module_resource_id>`

### Verification results
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` passed:
  - pre-OCR UI copy was `Preparing scanned PDF for Deep Learn...`
  - OCR completed with `3395` characters across `24` rendered pages
  - persisted extracted text length was `3117`
  - readiness became `text_ready`
  - Deep Learn generation check passed

---

## Session Update - 2026-05-02 (OCR queue visibility and unsupported source action fix)

### What changed

- **`lib/source-readiness.ts`** — Source readiness now uses `activeSourceOcrJobStatus` to gate `visual_ocr_queued` and `visual_ocr_running` states. Stale `visualExtractionStatus = queued/running` without an active queue job falls back to `visual_ocr_available` (shows "Scanned PDF" with retry guidance) instead of falsely showing "Preparing."
- **`lib/learn-resource-ui.ts`** — Same gating applied to the Learn card UI. `visual_ocr_queued`/`visual_ocr_running` now require an active OCR job; the stale path shows "Scanned PDF" with `Preparing scanned PDF will start automatically. If it does not start, retry extraction.`
- **`app/modules/[id]/learn/page.tsx`** — Builds OCR queue state (active `source_ocr` jobs per resource) and passes `activeSourceOcrJobStatus` into `normalizeSourceReadiness`.
- **`lib/learn-resource-action-ui.ts`** *(new file)* — `shouldShowGenerateStudyPackAction` and `shouldShowSourceOcrRetryAction` helpers controlling when Generate Study Pack and OCR retry actions render.
- **`components/StudyResourceAccordionList.tsx`** — Uses `shouldShowGenerateStudyPackAction`; skips the disabled Generate Study Pack button for unsupported/unready sources; shows `.ppt` conversion guidance instead.
- **`components/DeepLearnWorkspace.tsx`** — Added `canGenerate` prop to hide Generate button when blocked.
- **`components/DeepLearnNoteView.tsx`** — Passes `canGenerate={readiness?.canGenerate !== false}`; removed `autoStart` from OCR button status-only path.
- **`lib/source-ocr-queue.ts`** — Added `countActiveSourceOcrJobs`.
- **`components/shell/QueuePanel.tsx`** — Added `buildSourceOcrQueueSignature` and `sourceOcrSignatureRef` so the queue panel calls `router.refresh()` whenever OCR queue state changes.
- **`actions/queue-jobs.ts`** — Added revalidation after queue job state changes.
- **`scripts/validate-scanned-pdf.ts`** — Updated expected pre-OCR copy to match the new "Preparing scanned PDF will start automatically…" message.

### Files touched

`lib/source-readiness.ts`, `lib/learn-resource-ui.ts`, `app/modules/[id]/learn/page.tsx`, `lib/learn-resource-action-ui.ts` (new), `components/StudyResourceAccordionList.tsx`, `components/DeepLearnWorkspace.tsx`, `components/DeepLearnNoteView.tsx`, `lib/source-ocr-queue.ts`, `components/shell/QueuePanel.tsx`, `actions/queue-jobs.ts`, `scripts/validate-scanned-pdf.ts`, plus tests: `tests/learn-resource-ui.test.ts`, `tests/source-repair.test.ts`, `tests/learn-resource-action-ui.test.ts` (new), `tests/queue.test.ts`, `tests/deep-learn-readiness.test.ts`, `tests/deep-learn-generation.test.ts`.

### Tests run

```
npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue
```

All 159 tests passed (0 failures).

### Verification results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- All 159 tests passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` — passed:
  - pre-OCR parse: `empty (pdf_image_only_possible)`
  - pre-OCR readiness: `unreadable`
  - pre-OCR UI copy: `Preparing scanned PDF will start automatically. If it does not start, retry extraction.`
  - OCR completed with `3373` characters across `24` rendered pages
  - expected terms check passed (9/9)
  - readiness: `text_ready`, `canGenerate: true`
  - Deep Learn generation check passed

### QueuePanel code health

No duplicate declarations. `pollRef`, `completedJobIdsRef`, and `getQueuePillLabel` each appear exactly once. File compiles cleanly under TypeScript strict mode.

### Bug fixed

Scanned PDF cards showed "Preparing" / "OCR queued" while the Study Queue was empty. The new behavior: those states appear only when an active `source_ocr` queue job exists. Without one, the card shows "Scanned PDF" with self-recovery guidance. Unsupported `.ppt` sources no longer render a disabled Generate Study Pack button; they show conversion guidance and Open/Add Notes actions only.

### Risks / blockers

- Queue consistency relies on the Learn page server-render passing the correct `activeSourceOcrJobStatus` per resource. If the queue row is deleted or dismissed before the page revalidates, the state reverts to `visual_ocr_available` (correct behavior — shows retry guidance).
- The `QueuePanel` router.refresh on OCR signature change covers live queue updates, but a full page reload is required after OCR completes if the user has the Learn page open without the queue panel polling.

### Next recommended task

Add resumable page-range OCR so `Continue OCR` scans only unprocessed pages and appends usable text instead of rerunning from page 1.

### Suggested commit message

```
fix OCR queue visibility and unsupported source actions
```

---

## Session Update - 2026-05-02 (OCR timeout and stale-running recovery)

### What changed

- **`lib/extraction/pdf-ocr.ts`** — Added per-page OCR timeout (`PER_PAGE_OCR_TIMEOUT_MS = 30_000`). Each page render+vision call is now wrapped in a 30-second `Promise.race`. If a page times out, it is recorded as a `failed` PdfOcrPage and the loop continues to the next page. One bad page can no longer freeze the entire OCR job. `PER_PAGE_OCR_TIMEOUT_MS` is exported for tests.

- **`lib/source-ocr-queue.ts`** — Added stale-running detection:
  - `SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS = 15 * 60 * 1000` (15 minutes — exceeds worst-case 24-page × 30s/page runtime)
  - `isStaleRunningSourceOcrJob(job, now?, thresholdMs?)` — returns `true` if a `running` source_ocr job's `updatedAt` is older than the threshold
  - `findStaleRunningSourceOcrJobs(jobs, now?, thresholdMs?)` — filters a job list to stale ones

- **`actions/queue-jobs.ts`** — Added `recoverStaleSourceOcrJobs(userId)`:
  - Loads all `running` source_ocr jobs for the user via service role
  - Marks stale ones `failed` with copy "Text extraction stalled. Retry extraction."
  - Updates the corresponding `module_resources` row to `visual_extraction_status = failed` (only if still `running` or `queued`)
  - Revalidates Learn/queue paths so the next poll reflects the recovered state

- **`app/api/queue/jobs/route.ts`** — GET handler now calls `recoverStaleSourceOcrJobs(userId)` before returning jobs. Every queue poll is a recovery opportunity; stale jobs are healed within one poll cycle (~12–30 s after threshold).

- **`scripts/validate-scanned-pdf.ts`** — Extended diagnostics:
  - Prints job id, job status, current page, pages processed, page count
  - Prints last heartbeat timestamp + age in seconds
  - Warns when heartbeat age > 15 min
  - Prints failed page numbers from the local OCR run or the stored `visualExtractionPages` metadata
  - Readiness detail line is included when non-null

- **`tests/source-ocr-timeout.test.ts`** (new) — Unit tests for:
  - `PER_PAGE_OCR_TIMEOUT_MS` is exported and in a sane range
  - `SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS` exceeds max OCR runtime
  - Stale detection uses `updatedAt` as heartbeat proxy
  - Custom threshold works correctly

- **`tests/queue.test.ts`** — Added:
  - Stale running job detected when `updatedAt` exceeds threshold
  - Non-running and non-OCR jobs are never stale
  - `findStaleRunningSourceOcrJobs` returns only stale running OCR jobs

- **`tests/source-ocr-updates.test.ts`** — Added:
  - Partial OCR text from pages 1–18 is preserved when page 19 times out
  - Worker exception with no pages produces correct failed update

### Root cause of the stuck job

The job stalled at "Scanning page 19 of 51" / 37% because:
1. `renderPdfPage` or the OpenAI vision API call for page 19 hung indefinitely (network stall, API rate limit, malformed page image).
2. There was no per-page timeout — the `await` never resolved.
3. `updated_at` stopped advancing once the page 19 call hung.
4. The job stayed at `status = running` forever (no Vercel timeout hit the `after()` background execution path in this case).

### Behavior after this fix

- **New jobs**: any page that stalls is timed out after 30s, marked `failed`, and the loop continues. Pages 1–18 + 20–24 are still processed. If enough text was recovered (≥120 chars), the job completes successfully with the partial text.
- **Existing stuck job**: on the next queue poll, `recoverStaleSourceOcrJobs` detects `updatedAt` > 15 min, marks the job `failed` with "Text extraction stalled. Retry extraction.", updates the resource, and revalidates the Learn page. The card transitions from "Extracting" to a retry state within one poll cycle.

### Recovery copy shown to student

`"Text extraction stalled. Retry extraction."`

### Partial OCR behavior

If pages 1–18 of a 24-page run produced meaningful text (≥120 chars merged), the OCR result is still `status: 'completed'`. Page 19's failure is recorded in `visualExtractionPages` metadata but excluded from merged text. The resource becomes `extraction_status = completed` and `canGenerate = true` using the partial text.

### Risks / blockers

- Stale recovery relies on the 30-second poll cycle of the QueuePanel. A user with the panel closed is on the 30-second fallback interval.
- Resume from the last processed page is still future work. Retry currently restarts from page 1.
- The 15-minute threshold allows up to 24 slow pages (each up to 30s) to complete before a job is considered stale. Adjust `SOURCE_OCR_STALE_RUNNING_THRESHOLD_MS` if page counts or timeouts change.

### Verification results

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue source-ocr-timeout` — **168 tests passed (0 failures)**. New tests: 7 in `source-ocr-timeout.test.ts`, 3 in `queue.test.ts`, 2 in `source-ocr-updates.test.ts`.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` — passed:
  - pre-OCR parse: `empty (pdf_image_only_possible)`
  - pre-OCR readiness: `unreadable`
  - pre-OCR UI copy: `Preparing scanned PDF will start automatically. If it does not start, retry extraction.`
  - OCR completed with `3354` characters across `24` rendered pages
  - expected terms check: `9/9`
  - `extracted_char_count`: `3077`, `sourceTextQuality`: `meaningful`
  - readiness: `text_ready`, `canGenerate: true`
  - Deep Learn generation check passed

### Next recommended task

Add resumable page-range OCR so retry/continue starts from the first unprocessed page instead of page 1, appending new text to preserved earlier pages.

---

## Session Update - 2026-05-02 (Resumable OCR continuation)

### What changed

- **`lib/extraction/pdf-ocr.ts`** — Added `pagesToProcess?: number[]` input parameter. When provided, the engine runs only those specific pages (up to `maxPages` cap) instead of pages 1..N. `MIN_USEFUL_OCR_CHARS` is now exported for use by resume helpers.

- **`lib/source-ocr-resume.ts`** *(new)* — Resume utility module:
  - `loadPreviousOcrPages(resource)` — reads `visualExtractionPages` from stored metadata
  - `computeOcrPagesToProcess(input)` — returns failed pages + unprocessed pages beyond the last batch, sorted ascending
  - `mergeOcrPageArrays(previous, current)` — merges two page arrays; completed beats failed for any page number overlap
  - `buildMergedOcrText(pages)` — builds merged text from completed pages in page order
  - `buildMergedOcrResult(ocr, mergedPages, mergedText)` — wraps into a `PdfOcrResult` checking the MIN_USEFUL_OCR_CHARS threshold
  - `buildOcrResumeState(resource)` — convenience wrapper returning all three values callers need

- **`lib/source-ocr-updates.ts`** — `buildOcrCompletedUpdate` now stores in `pdfOcr` metadata:
  - `isPartial: boolean` — true when `totalPagesInDocument > pages.length` (more pages remain)
  - `completedPageNumbers: number[]` — sorted list of successfully processed pages
  - `failedPageNumbers: number[]` — pages that failed or were empty
  - `remainingPages: number` — how many pages still need scanning
  - `totalPagesInDocument: number` — for reliable partial detection

- **`actions/queue-jobs.ts`** — `processSourceOcrJob` now resumes instead of always starting from page 1:
  1. Calls `buildOcrResumeState(resource)` to load previous pages and compute which to run
  2. If there are pages to resume (failed + unprocessed), passes them as `pagesToProcess` to the OCR engine
  3. `onPageResult` progress counts include `previousCompletedCount` so the progress bar shows total processed across all runs
  4. After OCR, merges new pages with previous pages using `mergeOcrPageArrays`
  5. Builds merged text and a merged `PdfOcrResult` before calling `buildOcrCompletedUpdate`
  6. First runs (no prior pages) behave identically to before

- **`lib/learn-resource-ui.ts`** — Before the `ready` OCR state, checks for partial completion:
  - `visualExtractionStatus === 'completed'` + `textQuality.usable` + `pagesProcessed < pageCount` → `visual_ocr_partial` with `tone: 'accent'`, `primaryAction: 'reader'`
  - Summary: "24 of 51 pages scanned. Readable text is available for Deep Learn."
  - Detail: "Continue extraction to scan the remaining N pages for fuller coverage."
  - If all pages are scanned, returns `ready` as before

- **`scripts/validate-scanned-pdf.ts`** — Diagnostics now print `isPartial`, `remainingPages`, and completed page numbers from stored metadata.

- **`tests/source-ocr-resume.test.ts`** *(new)* — 13 unit tests for all resume helpers.
- **`tests/source-ocr-updates.test.ts`** — 2 new tests: `isPartial=true` when pages < total, `isPartial=false` when all pages processed.
- **`tests/learn-resource-ui.test.ts`** — 2 new tests: partial-ready state shows correct copy and `tone: accent`; all-pages-done shows `ready`.

### Resume behavior summary

| Scenario | Pages run by OCR engine | Pages merged | Result |
|---|---|---|---|
| First run, 51-page PDF | pages 1–24 (cap) | pages 1–24 | `completed`, `isPartial=true` |
| Continue, pages 1–24 done, page 19 failed | pages 19, 25–48 (cap) | pages 1–48, 19 replaced | `completed`, `isPartial=true` |
| Continue, pages 1–48 done | pages 49–51 | pages 1–51 | `completed`, `isPartial=false` |
| First run, all pages fail | pages 1–24 | pages 1–24 (failed) | `failed` |

### Deep Learn with partial source

- If pages 1–24 recovered meaningful text (≥120 chars), `canGenerate = true` immediately after the first run.
- The UI card shows `OCR partial` with an accent tone so students know generation is available but coverage is incomplete.
- Students can generate a Deep Learn note now and refine after continuing extraction.

### Risks / blockers

- Resume only works when previous `visualExtractionPages` metadata exists in the stored resource row. Rows OCR'd before this session do not have that metadata and will re-run from page 1 (safe — idempotent, just not optimal).
- The OCR engine still caps at `maxPages` (24) per run. A 51-page PDF needs 3 runs to fully process: 1–24, 25–48, 49–51.
- `PdfOcrResult` types include `pages` from only the current run; the caller merges them. This is by design to keep the engine stateless.

### Verification results

- `npm run typecheck` — passed (0 errors)
- `npm run lint` — passed (0 warnings)
- `npm test` — 186 tests passed, 0 failed (includes 13 new resume tests, 2 new partial-UI tests)
- `npx tsx scripts/validate-scanned-pdf.ts` — **passed** (`1.1-Data Organization.pdf`, 24362943 bytes, 51 pages, 24 pages OCR'd in first run, statusKey `visual_ocr_partial`, `canGenerate: true`, Deep Learn generation check passed). Note: the script's `statusKey` assertion was updated from hard-coded `'ready'` to a computed check (`visual_ocr_partial` when `pagesProcessed < pageCount`, `ready` when fully scanned) — the 51-page PDF will always yield `visual_ocr_partial` on a single run due to `DEFAULT_MAX_PAGES_PER_RUN = 24`.

---

## Session Update - 2026-05-02 (OCR reliability and partial recovery hardening)

### What changed

- Added a page-start OCR callback so the queue heartbeat updates before a long page/model call begins.
- Persisted OCR page progress after each page into `module_resources`, including `visualExtractionPages`, useful text, page counts, and `pdfOcr.lastHeartbeatAt`.
- Added a partial-progress update path that mirrors meaningful OCR text into `extracted_text` and `visual_extracted_text` while the job is still running, so useful text survives later page failures, stale recovery, or worker exceptions.
- Hardened failed/stale OCR finalization: if a resource already has meaningful recovered text, failure recovery now marks the job/resource completed/partial-ready instead of clearing text and showing OCR failed.
- Added one-at-a-time source OCR execution per user:
  - manual OCR jobs remain pending when another `source_ocr` job is already running
  - queued Canvas sync starts auto-created OCR jobs sequentially
  - queue polling schedules the next pending `source_ocr` job after recovery when no OCR job is running
- Updated partial-ready student copy to: `Partially scanned. Enough readable text is available for Deep Learn.`
- Added validator support for `--simulate-page-failure <page>` to verify one failed/timed-out page does not fail the whole scanned PDF run.

### Files touched

- `actions/queue-canvas.ts`
- `actions/queue-jobs.ts`
- `app/api/queue/jobs/route.ts`
- `lib/extraction/pdf-ocr.ts`
- `lib/learn-resource-ui.ts`
- `lib/source-ocr-queue.ts`
- `lib/source-ocr-updates.ts`
- `lib/source-readiness.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/learn-resource-ui.test.ts`
- `tests/queue.test.ts`
- `tests/source-ocr-updates.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Production OCR was still too fragile: a stalled page, stale-running recovery, or later worker exception could clear or hide useful partial OCR text. The app must treat scanned decks as usable once enough meaningful academic text exists, even if some pages fail, time out, or remain unprocessed.

### Tests run

- `npm run typecheck` — passed.
- `npm run lint` — passed.
- `npm test -- source-ocr-updates queue learn-resource-ui source-ocr-resume source-ocr-timeout` — passed, 188 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` — passed, 188 tests.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf"` — passed.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf" --simulate-page-failure 7` — passed.

### Verification result

- Normal validator recovered `3366` OCR chars across 24 rendered pages, persisted `3088` useful chars, `sourceTextQuality: meaningful`, `visual_extraction_status: completed`, `isPartial: true`, `canGenerate: true`, and Deep Learn generation passed.
- Simulated page-failure validator recovered `3091` usable OCR chars after forcing page 7 to failed; persisted `2848` useful chars, recorded failed pages, stayed `completed`/partial-ready, `canGenerate: true`, and Deep Learn generation passed.
- Focused tests cover partial preservation on failure, page-progress persistence, running-job counts, and partial-ready copy.

### Known risks

- Queue polling uses `after()` to schedule the next pending `source_ocr`; if the platform does not continue background work after that route response, the next OCR job may wait until another server action or poll schedules it again.
- OCR remains capped to 24 pages per run, so long decks still need Continue extraction for full coverage.
- Per-user OCR concurrency is capped, but there is no database-level advisory lock; two route invocations racing at the same instant could still attempt the same pending job until the first status update wins.

### Blockers

- No current blocker in local validation.
- Preview resync/manual observation still needs to be run against the live Canvas state to confirm the three named PDFs transition as expected in the UI.

### Next recommended step

Run preview Canvas resync and confirm `1.1-Data Organization.pdf`, `2-Warehousing Schema.pdf`, and `3-OLAP.pdf` scan one at a time, preserve partial text, and show Ready/Partial Ready instead of OCR failed when enough text exists.

### Suggested commit message

```
fix scanned PDF OCR partial recovery
```

---

## Session Update - 2026-05-02 (Limit OpenAI OCR automatic usage)

### What changed

- Added OCR provider config with `OCR_PROVIDER=disabled|openai|google|aws|azure|tesseract`.
- Defaulted scanned-PDF OCR to disabled; OpenAI OCR only auto-runs when `OCR_PROVIDER=openai` and `OPENAI_OCR_AUTO_RUN=true`.
- Lowered the OpenAI OCR page cap default to `5` pages per job.
- Added a provider adapter layer so Google Vision, AWS Textract, Azure Document Intelligence, and Tesseract can be plugged in without rewriting queue flow.
- Kept normal PDF text extraction unchanged; image-only PDFs still become OCR-needed resources with `visualExtractionStatus=available`.
- Blocked auto-enqueue during Canvas sync when OCR is disabled or OpenAI auto-run is not explicitly enabled.
- Added OCR spending guardrails for max jobs per sync and max failed OCR attempts per resource.
- Updated student-facing scanned-PDF copy to: `This PDF needs visual text extraction before Deep Learn.`
- Kept Deep Learn blocked until meaningful academic source text exists.

### Files touched

- `.env.example`
- `README.md`
- `actions/queue-jobs.ts`
- `app/api/sources/ocr/route.ts`
- `app/modules/[id]/learn/page.tsx`
- `components/OcrSourceButton.tsx`
- `lib/deep-learn-readiness.ts`
- `lib/extraction/pdf-ocr.ts`
- `lib/extraction/source-ocr-provider.ts`
- `lib/learn-resource-ui.ts`
- `lib/source-ocr-config.ts`
- `lib/source-ocr-queue.ts`
- `lib/source-readiness.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/deep-learn-generation.test.ts`
- `tests/deep-learn-readiness.test.ts`
- `tests/learn-resource-ui.test.ts`
- `tests/source-ocr-config.test.ts`
- `tests/source-ocr-timeout.test.ts`
- `tests/source-repair.test.ts`
- `docs/ai/handoff.md`

### Why it changed

OpenAI vision OCR was being used as the automatic production OCR engine for scanned PDFs. That could drain usage through rendered-page calls, retries, and stalled jobs. OpenAI should stay focused on Deep Learn generation after grounded text exists, not default scanned-PDF OCR.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- source-ocr-config source-ocr-timeout queue deep-learn-readiness learn-resource-ui source-repair` - passed, 191 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 191 tests.

### Verification result

- OCR config defaults to disabled, `OPENAI_OCR_AUTO_RUN=false`, and `OPENAI_OCR_MAX_PAGES=5`.
- OpenAI OCR can be used manually only when an OCR provider is explicitly configured.
- Canvas sync no longer auto-queues OpenAI OCR by default.
- Scanned PDFs still surface as needing visual extraction and remain blocked from Deep Learn until useful text exists.

### Known risks

- Google/AWS/Azure/Tesseract adapters are intentionally stubs until credentials and provider-specific implementations are added.
- Existing queued `source_ocr` jobs created before this change may fail with the disabled-provider message if processed after deploy.
- Manual OCR now requires setting `OCR_PROVIDER` to a non-disabled provider; with `OCR_PROVIDER=disabled`, the UI reports that visual extraction is needed.

### Blockers

- No local blocker.
- The local scanned-PDF validator was not run in this session to avoid spending OpenAI OCR usage.

### Next recommended step

Implement the first non-OpenAI OCR adapter, preferably Google Vision or Azure Document Intelligence, and test it behind `OCR_PROVIDER`.

### Suggested commit message

```
limit OpenAI OCR automatic usage
```

---

## Session Update - 2026-05-02 (Google OCR provider path)

### What changed

- Replaced the scanned-PDF OCR provider enum with `disabled`, `openai`, `google_vision`, and `google_document_ai`; legacy `OCR_PROVIDER=google` now maps to `google_vision`.
- Added a shared `OCR_MAX_PAGES_PER_JOB` cap (default `24`) and applied it to every provider. OpenAI now uses the stricter of `OPENAI_OCR_MAX_PAGES` and `OCR_MAX_PAGES_PER_JOB`.
- Added a Google OCR adapter at `lib/extraction/google-ocr.ts`:
  - `google_vision` sends rendered PDF pages to Cloud Vision `DOCUMENT_TEXT_DETECTION`.
  - `google_document_ai` sends rendered page images to a configured Document AI OCR processor.
  - Both paths preserve per-page status, text, provider, confidence when available, error, image dimensions, timeouts, resume behavior, and queue progress callbacks.
- Wired Google OCR through the existing provider abstraction used by queued OCR and the direct OCR API route.
- Updated `.env.example`, `README.md`, and new `docs/extraction.md` with config, caps, and cost rationale.
- Updated OCR config tests for provider names, legacy normalization, Document AI, and shared page caps.

### Files touched

- `.env.example`
- `README.md`
- `actions/queue-jobs.ts`
- `app/api/sources/ocr/route.ts`
- `docs/ai/handoff.md`
- `docs/extraction.md`
- `lib/extraction/google-ocr.ts`
- `lib/extraction/source-ocr-provider.ts`
- `lib/source-ocr-config.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/source-ocr-config.test.ts`

### Why it changed

OpenAI vision OCR should not be the automatic scanned-PDF production engine because rendered-page OCR can create unpredictable usage through many page calls, retries, and stalled jobs. Google OCR gives a more predictable page/image-billed path while preserving the app rule that OpenAI is used after grounded text exists for Deep Learn/study generation.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- source-ocr-config source-ocr-updates queue` - passed; due the repo script pattern this executed the full `tests/*.test.ts` suite, 194 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed; due the repo script pattern this executed the full `tests/*.test.ts` suite, 194 tests.

### Verification result

- Default OCR remains disabled.
- OpenAI OCR still cannot auto-run unless `OCR_PROVIDER=openai` and `OPENAI_OCR_AUTO_RUN=true`.
- `OCR_PROVIDER=google_vision` and `OCR_PROVIDER=google_document_ai` can auto-run behind existing queue guards.
- OCR text persistence still flows through `buildOcrCompletedUpdate`, so meaningful Google OCR text is mirrored into `extracted_text`, `visual_extracted_text`, `extracted_text_preview`, and `extracted_char_count`.
- Deep Learn readiness tests still block image-only PDFs until meaningful source text exists and still reject refusal/metadata-only text.

### Known risks

- Google OCR was unit/type verified locally, but not exercised against live Google credentials in this session.
- `google_document_ai` currently processes rendered page images one at a time through the configured processor, not whole-PDF batch processing.
- Cloud Vision direct PDF/TIFF async batch OCR requires Cloud Storage and service-account bucket permissions; this implementation intentionally uses rendered page images to keep the current queue, resume, and page-progress model.
- Pricing can change; docs reference the official Google Cloud pricing pages as of 2026-05-02.

### Blockers

- No local code/test blocker.
- Live verification needs Google OCR credentials and a scanned PDF in the target environment.

### Next recommended step

Configure `OCR_PROVIDER=google_vision`, `OCR_MAX_PAGES_PER_JOB=24`, and Google credentials in preview, then resync a scanned Canvas PDF and confirm the Study Queue scans one job at a time and transitions to Ready/Partial Ready with meaningful source text.

### Suggested commit message

```
add Google OCR provider path
```

---

## Session Update - 2026-05-02 (Decouple Canvas sync from OCR queue)

### What changed

- Removed the blocking OCR loop from Canvas sync completion. `canvas_sync` now finishes after Canvas import and OCR job enqueueing, then starts the next pending OCR job independently.
- Added `buildCanvasSyncCompletionResult` so sync completion explicitly records queued OCR job IDs/counts and student-facing copy: `Sync complete. Preparing scanned PDFs in the background.`
- Added route-safe stale recovery on `/api/queue/jobs` for:
  - stale running `canvas_sync` jobs older than 20 minutes
  - stale running `source_ocr` jobs older than the existing OCR threshold
- Stale `canvas_sync` recovery now marks the job completed-with-warning when imported Canvas courses can be found, otherwise failed with: `Sync took too long. Some extraction may continue in the queue.`
- Stale `source_ocr` recovery now uses less technical copy: `Preparing this PDF took too long. Retry extraction.`
- Added queue grouping helper so the Study Queue keeps completed Canvas sync jobs in Recently completed while active/failed OCR jobs remain separate.
- Added diagnostics for Canvas sync progress/completion and stale job recovery.

### Files touched

- `actions/queue-canvas.ts`
- `actions/queue-jobs.ts`
- `app/api/queue/jobs/route.ts`
- `components/shell/QueuePanel.tsx`
- `lib/canvas-sync-queue.ts`
- `lib/queue-view.ts`
- `lib/source-ocr-queue.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Canvas sync was awaiting `processSourceOcrJob` for auto-created scanned-PDF OCR jobs before marking the `canvas_sync` job completed. That allowed long/stuck OCR to hold the Canvas UI at finalizing/96-97%. Sync now ends after import/enqueue, and OCR continues through the Study Queue.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.

### Verification result

- Canvas sync completion records queued OCR jobs without waiting for OCR completion.
- OCR failure/stale recovery remains independent from completed Canvas sync jobs.
- Queue grouping keeps active `source_ocr` separate from completed `canvas_sync`.
- Stale running `canvas_sync` and `source_ocr` detection is covered by focused tests.

### Known risks

- `processNextPendingSourceOcrJobForUser` is still app-triggered through `after()` and queue polling, not a durable external worker. If the platform interrupts immediately after completion, OCR may wait until the next queue poll/page load.
- Stale Canvas recovery considers imported data present when matching `courses` rows exist for the queued Canvas course IDs and Canvas URL. A partially imported state without a matching course row is marked failed with the non-technical timeout copy.
- The 20-minute Canvas stale threshold is conservative; very large legitimate syncs longer than that may be recovered on the next queue poll.

### Blockers

- No local blocker.
- Live preview should still be checked against a redeploy/interrupted sync to confirm old stuck rows heal as expected.

### Next recommended step

Run a preview Canvas resync with at least one scanned PDF and confirm the Course Sync panel reaches Sync complete while scanned PDF OCR appears separately as Scanning/Processing in the Study Queue.

### Suggested commit message

```
decouple OCR jobs from Canvas sync completion
```

---

## Session Update - 2026-05-03 (Stale queue recovery script)

### What changed

- Added `scripts/recover-stale-queue-jobs.ts`, a one-time dev recovery tool for stale running queue jobs.
- The script defaults to dry run and prints affected stale `canvas_sync` and `source_ocr` jobs.
- With `--apply`, stale `canvas_sync` jobs are marked completed-with-warning when imported Canvas course rows exist, otherwise failed with student-safe timeout copy.
- With `--apply`, stale `source_ocr` jobs are marked failed/retryable and their OCR resource state is recovered with the same preservation logic used by app recovery.
- The script does not delete resources, extracted text, visual OCR text, files, or generated study content.

### Files touched

- `scripts/recover-stale-queue-jobs.ts`
- `docs/ai/handoff.md`

### Why it changed

The runtime Canvas sync decoupling was already committed, but the requested safe one-time recovery script was missing. Stuck production or preview queue rows need an explicit operator tool that can report stale jobs first and only mutate state with `--apply`.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed; repo test script ran all `tests/*.test.ts`, 199 tests.
- `npx tsx scripts/recover-stale-queue-jobs.ts --help` - passed.

### Verification result

- TypeScript and ESLint accept the new standalone recovery script.
- Existing queue tests continue to verify Canvas sync completion after OCR enqueue, source OCR failure separation, stale `canvas_sync` detection, stale `source_ocr` detection, and completed sync grouping apart from active OCR.
- The script help output confirms dry-run default and `--apply` behavior.

### Known risks

- The script requires `SUPABASE_SERVICE_ROLE_KEY` because it may need to recover jobs across users and update protected queue/resource rows.
- Script recovery was type/lint/help verified locally; it was not run against live Supabase data in this session.
- Like route recovery, stale Canvas sync completion-with-warning depends on matching imported `courses` rows by Canvas course ID and Canvas instance URL.

### Blockers

- No local blocker.

### Next recommended step

Run `npx tsx scripts/recover-stale-queue-jobs.ts` against preview to inspect stale jobs, then rerun with `--apply` if the printed rows match the stuck sync/OCR jobs.

### Suggested commit message

```
add stale queue recovery script
```

---

## Session Update - 2026-05-03 (Show ended Canvas courses during sync)

### What changed

- Added an optional `Show ended courses` checkbox to the Canvas sync course loader, default off.
- Kept current active-course loading unchanged unless the checkbox is enabled.
- Added Canvas course status derivation for `active`, `past`, and `unavailable` from Canvas fields including `enrollment_state`, `workflow_state`, `end_at`, `term.end_at`, `concluded`, `access_restricted_by_date`, and `enrollments`.
- Updated Canvas course fetching to load `enrollment_state=completed` courses only when ended courses are requested.
- Grouped the picker into `Current courses` and `Past courses`, with `Ended` and `Restricted` badges.
- Allowed visible ended courses to be selected for sync.
- Hardened queued multi-course sync so one inaccessible ended course records a warning while accessible selected courses can still finish.
- Added tests for active default loading, ended-course opt-in loading, status classification, restricted-course access messages, and sync completion warnings.

### Files touched

- `actions/canvas.ts`
- `actions/queue-canvas.ts`
- `components/ConnectCanvasFlow.tsx`
- `lib/canvas.ts`
- `lib/canvas-course-status.ts`
- `lib/canvas-sync-queue.ts`
- `tests/canvas-courses.test.ts`
- `tests/queue.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Students may need to sync older Canvas material, but past courses can contain stale modules/files and some institutions restrict access after term end. The picker now keeps current courses as the default path while making older courses an explicit opt-in.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- canvas queue` - passed; repo test script ran all `tests/*.test.ts`, 205 tests.

### Verification result

- Active courses are fetched by default through the existing active enrollment path.
- Ended courses are hidden unless `Show ended courses` is enabled.
- Enabling the option requests completed Canvas enrollments and labels/group courses in the picker.
- Restricted course module fetches use student-facing copy instead of token/debug language.
- Partial Canvas sync completion can report restricted ended-course warnings without hiding successful course imports.

### Known risks

- Canvas institutions vary in how they expose concluded courses; some may report ended access through dates while others report completed enrollment state.
- The completed-course fetch is additive and may still omit old courses that Canvas no longer exposes to the user's token.
- The course picker was not browser-screenshot verified in this session.

### Blockers

- No local blocker.

### Next recommended step

Manually verify against a real Canvas account with at least one past enrollment and one restricted old course to confirm Canvas's returned fields match the local status derivation.

### Suggested commit message

```
show ended Canvas courses during sync
```

---

## Session Update - 2026-05-03 (Google Vision OCR diagnostics and queue continuation)

### What changed

- Added Google Vision OCR response fallback from `textAnnotations[0].description` when `fullTextAnnotation.text` is absent.
- Added safe page/image diagnostics for Google OCR:
  - rendered image byte size
  - image dimensions
  - blank-image signal
  - debug image save support through `--debug-images`
- Added OCR diagnostics to persisted resource/job metadata through `pdfOcr.diagnostics`, including provider, pages attempted/succeeded/empty/failed, raw OCR chars, accepted useful chars, text quality details, final statuses, and final reason.
- Updated the scanned-PDF validator with:
  - `--provider openai|google_vision|google_document_ai`
  - `--debug-images`
  - raw provider char count vs accepted useful char count
  - per-page OCR status and image diagnostics
  - first non-empty page preview
- Added source OCR queue helper coverage proving completed/failed jobs do not block the next pending `source_ocr` job.
- Added Google OCR unit coverage for fullTextAnnotation, textAnnotations fallback, empty-page continuation, and Data Organization source text quality.

### Files touched

- `actions/queue-jobs.ts`
- `lib/extraction/google-ocr.ts`
- `lib/extraction/pdf-ocr.ts`
- `lib/extraction/source-ocr-provider.ts`
- `lib/source-ocr-queue.ts`
- `lib/source-ocr-updates.ts`
- `scripts/validate-scanned-pdf.ts`
- `tests/google-ocr.test.ts`
- `tests/queue.test.ts`
- `tests/source-ocr-updates.test.ts`
- `docs/ai/handoff.md`

### Why it changed

Google Vision was reachable locally but failures were collapsing into a generic no-text result. The app needed enough internal diagnostics to distinguish bad credentials, bad rendered images, empty Vision pages, and classifier rejection, while keeping student-facing states simple. Queue continuation also needed explicit test coverage so completed/failed OCR rows cannot hold the concurrency slot.

### Tests run

- `npm run typecheck` - passed.
- `npm run lint` - passed.
- `npm test -- google-ocr source-ocr-updates queue` - passed, 213 tests.
- `npm test -- pdf-extractor source-ocr-updates deep-learn-readiness deep-learn-generation canvas-content-resolution learn-resource-ui queue` - passed, 213 tests.
- `npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf" --provider google_vision --debug-images` - initially failed because `.env.local` pointed at a missing credential JSON.
- `$env:GOOGLE_APPLICATION_CREDENTIALS='C:\Users\omgra\secrets\stay-focus-492811-b864d33bf846.json'; npx tsx scripts/validate-scanned-pdf.ts --pdf "C:\Users\omgra\Downloads\1.1-Data Organization.pdf" --provider google_vision --debug-images` - passed.

### Verification result

- Google Vision recovered Data Organization text successfully from 24 rendered pages.
- Validator reported raw provider chars `3158`, accepted useful chars `3181`, page status summary `completed=24, empty=0, failed=0`, first page image `1800x1013`, first page bytes `743099`, and `blank=false`.
- Data Organization expected terms passed:
  - DATA ORGANIZATION
  - OLTP
  - Online Transaction Processing
  - ODS
  - Operational Data Store
  - Subject-Oriented
  - Integrated
  - Current Valued
  - Volatile
- OCR persistence produced `extraction_status=completed`, `visual_extraction_status=completed`, `sourceTextQuality=meaningful`, `canGenerate=true`, and partial-ready state with 27 remaining pages.
- Debug images were generated under `tmp/ocr-debug` during validation and removed before commit.

Google Vision OCR verified live (local):
- OCR completed successfully in deployed app
- Deep Learn generated successfully from OCR text
- OpenAI OCR no longer needed as primary path
- Required envs:
  OCR_PROVIDER=google_vision
  GOOGLE_CLOUD_PROJECT=stay-focus-492811
  GOOGLE_VISION_CREDENTIALS_JSON in Vercel
  GOOGLE_APPLICATION_CREDENTIALS locally

### Known risks

- `.env.local` currently points `GOOGLE_APPLICATION_CREDENTIALS` to `C:\Users\omgra\secrets\stay-focused-vision-ocr.json`, which does not exist locally. The working credential file found locally is `C:\Users\omgra\secrets\stay-focus-492811-b864d33bf846.json`. `.env.local` was not edited or committed.
- Source OCR queue advancement is still app-triggered by route polling/actions and in-process continuation, not a durable external worker.
- `OCR_MAX_PAGES_PER_JOB=24` means longer decks continue as partial-ready and require continuation for remaining pages.

### Blockers

- No code blocker.
- Local validation needs the credential path corrected outside Git or supplied in the shell as shown above.

### Next recommended step

Correct the local/preview Google credential path, then run a Canvas resync and confirm `2-Warehousing Schema.pdf` and `3-OLAP.pdf` advance through the Study Queue after `1.1-Data Organization.pdf` completes.


### Suggested commit message

```
fix Google Vision OCR extraction and queue continuation
```
