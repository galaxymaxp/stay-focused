# Stay Focused — Implementation Plan (Schedule-First)

Author: galaxymaxp omgraythekid@gmail.com
Last Updated: 2026-04-29

## Purpose

This plan translates the schedule-first product direction into incremental, low-risk implementation phases without changing routes or database schema in the first pass.

## Current App Surfaces / Routes

Current primary surfaces observed in repository docs:

- `/` (Home)
- `/courses`
- `/library` (Study Library)
- `/calendar`
- `/settings`
- `/canvas` (Canvas connection/sync flow)
- `/drafts` (compatibility route; no longer intended as primary nav destination)

## Target Schedule-First Information Architecture

Priority hierarchy to preserve in all implementation:

1. **Schedule / Today Plan** (primary command center)
2. **Calendar** (deadline/event feeder into schedule)
3. **Tasks** (work inventory + status)
4. **Deep Learn / Review / Quiz** (execution tools launched from schedule blocks)
5. **Do Draft / Outputs** (production surfaces + saved artifacts)

Supporting principles:

- The home surface should answer: **“What should I do next with the time I have available?”**
- Calendar should provide signals, not become the main execution surface.
- AI tools should accelerate execution and reduce overwhelm.

## Mapping: Current Pages/Components → Future Structure

| Current Surface | Current Role | Target Role in Schedule-First Model | Notes |
|---|---|---|---|
| `/` Home | General landing/dashboard | **Today Plan / Schedule command center** | Highest-value first migration target |
| `/calendar` | Date/deadline display | Deadline/event feeder + schedule context | Keep route; rebalance hierarchy in UI |
| `/courses` | Course-centric navigation | Context layer for block metadata | Avoid becoming primary workflow |
| `/library` | Persistent generated output storage | Canonical Study Library (artifacts from blocks) | Preserve as retrieval + reference hub |
| `/drafts` | Legacy drafting entry point | Compatibility entry into Study Library/output flows | Maintain for backward compatibility |
| `/canvas` | Sync/auth data source setup | Upstream scheduler data source management | Keep setup-focused |
| `/settings` | Preferences/config | Availability, notification, and UX controls | Add schedule-relevant preferences first |

## Phased Rollout Plan

### Phase 0 — Documentation + Alignment (completed / in progress)

- Finalize AI context docs and implementation plan.
- Establish agent operating rules and handoff discipline.
- Confirm schedule-first canonical direction in README + handoff.

### Phase 1 — Lowest-Risk Implementation (recommended first coding phase)

- Reframe `/` into a **Today Plan-first layout** using existing data and components where possible.
- Add explicit “Next Block” and “Available Time” framing to top-of-page content.
- Keep existing routes and core data flow intact.
- Do not alter schema, migrations, or route names.

### Phase 2 — Calendar Feeder Hardening

- Improve calendar-to-schedule handoff affordances (deadline ingestion visibility, schedule impact explanation).
- Keep calendar secondary in nav emphasis and page hierarchy.

### Phase 3 — Block-Triggered Execution Tools

- Trigger Deep Learn / Review / Quiz / Do Draft from schedule blocks.
- Reduce navigation hops from schedule to execution.
- Ensure outputs automatically persist to Study Library.

### Phase 4 — Quality + Optimization

- Improve scheduling clarity, overload reduction, and confidence cues.
- Validate responsive UI quality and block-completion loops.

## Lowest-Risk First Implementation Phase (Detail)

Start with **Phase 1** because it has the best risk/reward profile:

- High user-impact copy/IA shifts on existing home surface.
- Minimal architectural risk (no route/database changes).
- Enables immediate user testing of schedule-first comprehension.
- Creates foundation for block-triggered tooling without deep rewrites.

## Risks / Blockers

- Existing component hierarchy may be dashboard-oriented and resist clear command-center prioritization.
- Scheduler confidence depends on Canvas signal quality and due-date consistency.
- Legacy mental model (“Calendar first”) may leak into nav labels and content ordering.
- Unclear block duration/priority heuristics could reduce trust if not explained.

## Technical Debt Notes

- Potential drift between legacy pages and schedule-first intent (especially `/calendar` and `/courses`).
- `/drafts` compatibility behavior may duplicate concepts already owned by Study Library.
- Documentation and implementation can diverge quickly without strict handoff updates.
- Possible over-broad component reuse causing clutter on primary workflow surfaces.

## Testing Checklist

Before and after each implementation phase:

- `npm run lint`
- `npm run typecheck`
- Route sanity checks for `/`, `/calendar`, `/library`, `/courses`, `/settings`, `/canvas`, `/drafts`
- Verify no route removals/renames during early phases
- Validate responsive layout behavior for desktop and laptop widths
- Validate that priority order remains visually explicit: Schedule first, Calendar second

## UX Success Criteria

A schedule-first implementation is successful when users can:

- Identify their next action in under 5 seconds from the home surface.
- Understand how much time they have and which block fits that time.
- Start a study block in one clear primary action.
- Access calendar context without losing execution focus.
- Save/find generated outputs reliably in Study Library.

## What Should NOT Be Changed Yet

- No database schema or migration changes.
- No route renames/removals.
- No broad architectural rewrites of unrelated pages.
- No redesign-first detours that delay command-center clarity.
- No feature additions that increase cognitive load before schedule flow is stable.
