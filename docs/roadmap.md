# Stay Focused Roadmap

## Product Direction

Stay Focused remains an action-first study workspace. The app should help a student decide what to do next, complete work with less friction, and keep generated outputs available after the moment they were created.

- Main pages: Home, Courses, Study Library, Calendar, Settings
- Keep Study Library as the permanent generated-content hub
- Do not restore Drafts as a primary navigation item
- Drafts are a content type inside Study Library
- Study Library is the bookshelf for all generated outputs, including Learning packs and Task drafts
- `/drafts` routes may redirect into Study Library, but they do not define product IA anymore
- Do not add new primary navigation without explicit product approval

## Non-Negotiable UX Rules

- Action-first, not information-first
- One purpose per page
- Reduce cognitive load before adding density
- No fake density or dashboard clutter
- Persistent generated outputs, not ephemeral AI surfaces
- Soft-glow 2026 responsive UI
- User-configurable accent color across app chrome and overlays
- Custom or minimal nested scrollbars where nested scrolling is necessary
- Study Library filters remain `All`, `Learning`, and `Tasks`

## Current Priorities

1. Keep the schedule-first Today Plan logically synchronized: selected free-time window, clock rings, current block, and schedule list must all describe the same blocks.
2. Run external Canvas sync detection every 15 minutes through cron-job.org while the app is on Vercel Hobby.
3. Keep sync cost-safe: small batches, duplicate guards, cooldowns, daily caps, and no OpenAI/OCR execution inside the cron request.
4. Keep Study Library coherent as the single saved-output destination.
5. Keep student-facing task execution language on Tasks while preserving compatibility redirects from old `/do` links.
6. Add file-making and reviewer outputs from stored generated content before adding new token-heavy generation flows.
7. Keep docs, schema, and implementation aligned with the shipped product direction.

## Phase 1-2 Implementation Notes

- `/api/cron/external-sync` is the external 15-minute cron entrypoint.
- The endpoint requires `Authorization: Bearer <CRON_SECRET>`.
- cron-job.org should schedule GET requests at minutes `0, 15, 30, 45` with a custom `Authorization` header.
- The endpoint must remain quick: detect configured/synced Canvas courses and queue small `canvas_sync` batches only.
- External Canvas cron/sync fetches should use bounded timeouts so slow Canvas responses do not hang the route or background processor.
- OpenAI generation and Google/OpenAI OCR must stay out of the cron request.
- Queue guards should prevent overlapping sync jobs, repeated per-course queueing inside the cooldown window, and daily cost spikes.
- Sync work must preserve successful extracted/OCR text on resync unless the Canvas file identity changes, and module `raw_content` must be rebuilt from the final preserved resource text.
- External sync processing should refresh existing Canvas resources and assignment status without running OpenAI module extraction or OCR workers inline.

## Email Notifications

Canvas update digest emails are live via Resend (`RESEND_API_KEY` + `EMAIL_FROM`).

- Digests send after a successful external Canvas sync when at least one meaningful Canvas update event is inserted.
- Meaningful types: `new_announcement`, `new_assignment`, `due_date_change`, `new_module`, `new_resource`.
- OCR, Deep Learn, queue, and debug events are never emailed.
- Events are grouped into one email per user (not one per item). Duplicate-looking rows collapse with a ×N count.
- App-level cooldown: `CANVAS_UPDATE_EMAIL_COOLDOWN_MINUTES` (default 30) prevents repeated emails within the window.
- Display cap: `CANVAS_UPDATE_EMAIL_MAX_ITEMS` (default 12) limits visible lines; overflow events are still marked sent.
- Recipients: Supabase account email only for this phase. Google/Microsoft destination selection is not yet added.
- User opt-in: Settings → Email Notifications → enable **Canvas updates digest** under Notification Types.
- Default is disabled; users must explicitly enable it.
- Test email in Settings uses the same Resend provider and sends to the Supabase account email.

## Future Features

- richer Study Library filtering and sorting within the existing IA
- better invalidation and refresh controls for persisted generated metadata
- tighter runtime verification coverage for high-value routes
- more grounded learning-output generation from extracted resource text
- additional quality-of-life polish for multi-course planning and saved-output recovery
- Google/Microsoft destination selection for Canvas update digest emails
