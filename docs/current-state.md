# Current State

This document reflects the codebase after the April 24, 2026 roadmap-alignment pass.

## Current App State

- Study Library is the main saved-content surface for generated outputs
- Drafts remain supported as a content model and legacy route family, but not as a main nav destination
- active-tab completions now render in-app toasts through a lightweight global toast host
- hidden-tab completions still rely on browser notifications
- notification sounds still respect local storage preferences for enabled state and volume
- course summaries are persisted on the `courses` table and reused until the source fingerprint changes

## Important Implementation Notes

- `lib/notifications.ts` dispatches `stay-focused:toast` for in-app notifications
- `components/ToastHost.tsx` is mounted globally in the root app shell and renders soft-glow toast stacks
- `lib/course-page-summary.ts` computes a course-content fingerprint, reads cached summaries from Supabase, and refreshes them only when the course context changes
- `supabase/migrations/20260424010000_add_course_ai_summaries.sql` adds summary persistence fields to `public.courses`
- `app/courses/[id]/page.tsx` now resolves summaries through the persistence layer instead of calling OpenAI directly on every request
- verification after this pass included `npm run lint`, `npm run typecheck`, `npm run build`, and local production route checks for `/`, `/courses`, `/library`, `/settings`, and `/canvas`

## Known Follow-Up Items

- sync actions currently rely on summary fingerprint changes rather than explicitly clearing cached course summaries during course updates
- toast interactions are intentionally minimal and do not yet include manual dismissal or action buttons
- route verification should continue expanding around Study Library detail flows and course-specific shells
