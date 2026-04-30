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
