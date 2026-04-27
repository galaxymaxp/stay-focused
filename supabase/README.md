# Supabase Schema Notes

The app expects newer synced-resource tables and columns to exist in the connected Supabase project.

The repo now includes a baseline core-schema migration for brand-new projects:

- `supabase/migrations/202604040800_create_workspace_core_tables.sql`

Important migration for attachment-backed Learn:

- `supabase/migrations/202604040800_create_workspace_core_tables.sql`
- `supabase/migrations/20260405_add_module_resources.sql`
- `supabase/migrations/202604050900_add_learn_visibility_and_task_canvas_links.sql`
- `supabase/migrations/20260406_add_module_resource_study_state.sql`
- `supabase/migrations/20260407_add_module_resource_study_last_opened_at.sql`
- `supabase/migrations/20260408_add_module_terms.sql`
- `supabase/migrations/20260409_add_task_canvas_completion_metadata.sql`
- `supabase/migrations/20260410_add_task_planning_annotations.sql`
- `supabase/migrations/20260411_backfill_task_item_planning_and_completion_metadata.sql`
- `supabase/migrations/20260412_add_canvas_course_identity.sql`
- `supabase/migrations/20260413_add_auto_prompt_results.sql`
- `supabase/migrations/20260414_add_auto_prompt_user_identity.sql`
- `supabase/migrations/20260419_add_user_profile_avatars.sql`
- `supabase/migrations/20260420_add_deep_learn_notes.sql`
- `supabase/migrations/20260421000000_add_drafts.sql`
- `supabase/migrations/20260423000000_unify_draft_identity.sql`
- `supabase/migrations/20260424010000_add_course_ai_summaries.sql`

That migration creates:

- the baseline `courses`, `modules`, `learning_items`, `task_items`, `tasks`, and `deadlines` tables
- `public.module_resources`
- indexes used by resource sync and Learn drill-down
- `public.module_resource_study_state`
- indexes used by manual study progress and Learn workflow overrides
- `last_opened_at` support for subtle study-file resume cues

If you see errors such as:

- `PGRST205 Could not find the table 'public.module_resources' in the schema cache`

check the following:

1. Confirm `.env.local` points to the intended Supabase project.
2. Apply the missing migration to that project.
3. Refresh the PostgREST schema cache if the table was created recently.

Current app features that depend on `module_resources`:

- Canvas attachment extraction during sync
- Learn resource grounding
- resource detail pages
- Canvas deep links for study resources

Current app features that depend on `module_resource_study_state`:

- per-file study progress (`Not started`, `Skimmed`, `Reviewed`)
- manual `Treat as activity instead` workflow overrides for study files
- module Learn progress rollups and resumable reader state
- subtle `Resume where you left off` cues on module Learn pages

Current app features that depend on `module_terms`:

- auto-built module terms inside module Learn
- optional term corrections such as remove, pin, refresh, and add missing term
- quiz generation grounded only in the final module term set

Current app features that depend on `20260409_add_task_canvas_completion_metadata.sql`:

- assignment-like module work can sync into `completed` when Canvas already shows it as submitted, graded, or otherwise cleared
- module Learn surfaces can show clearer "done in Canvas" state without making finished work compete with unfinished work
- task rows keep a stored Canvas assignment id for safer future refresh/backfill work

Current app features that depend on `20260410_add_task_planning_annotations.sql`:

- Today and Calendar can show the same planner annotations (`Best next step`, `Needs attention`, `Worth reviewing`) for the same synced task
- task items now keep their completion origin directly, so calendar-facing views can distinguish Canvas-completed work from manual completion without reading the legacy `tasks` table
- setting a new `Best next step` clears the previous one so the planner keeps a single top focus item

Current app features that depend on `20260412_add_canvas_course_identity.sql`:

- Canvas course persistence now upserts deterministically on `canvas_instance_url + canvas_course_id`
- repeat sync protection no longer depends on fuzzy course recovery by code, name, or raw module content
- legacy duplicate `courses` rows are merged onto a canonical row before the new unique index is installed

Current app features that depend on `20260413_add_auto_prompt_results.sql` and `20260414_add_auto_prompt_user_identity.sql`:

- Auto Prompt results can persist across reloads and navigation using the database instead of client storage
- the current anonymous cookie identity continues to work
- authenticated users can promote saved Auto Prompt results onto a real auth-backed identity without regenerating the content

Current app features that depend on `20260419_add_user_profile_avatars.sql`:

- Google sign-in can persist a default avatar URL in `public.user_profiles`
- authenticated users can upload a custom avatar into the `profile-avatars` storage bucket
- avatar APIs under `/api/profile/avatar` and `/api/profile/avatar/upload` resolve custom upload, Google avatar, then placeholder

Current app features that depend on `20260424010000_add_course_ai_summaries.sql`:

- course pages can reuse persisted AI summaries instead of calling OpenAI on every render
- summary refreshes are tied to a lightweight source fingerprint built from course and module context
- generated summaries remain durable across reloads and route changes until the underlying course context changes

## Fresh Project Reset

If you want a clean Supabase project instead of repairing a drifted one:

1. Create a new hosted Supabase project in the Supabase dashboard.
2. Link this repo to the new project.
3. Run `npx supabase db push` from the repo root.
4. Pull the new project's API keys with `npx supabase projects api-keys --project-ref <ref>`.
5. Update `.env.local` so `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point to the hosted project.
6. If you use Google OAuth, update Auth > URL Configuration in that hosted project so the allowed origins can return to `/auth/callback`.

With the baseline migration in place, a brand-new project can now be recreated from the repo migrations alone.

Do not copy `site_url`, `additional_redirect_urls`, or any localhost ports from `supabase/config.toml` into the hosted app setup. That file is only for local Supabase CLI services.

The module delete flow is defensive if `module_resources` is missing, but the proper fix is still to apply the migration to the active Supabase environment.
