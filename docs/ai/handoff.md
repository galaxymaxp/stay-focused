# Stay Focused — AI Session Handoff

Author: galaxymaxp omgraythekid@gmail.com
Last Updated: 2026-04-29

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
