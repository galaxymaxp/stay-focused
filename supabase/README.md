# Supabase Schema Notes

The app expects newer synced-resource tables and columns to exist in the connected Supabase project.

Important migration for attachment-backed Learn:

- `supabase/migrations/20260405_add_module_resources.sql`
- `supabase/migrations/202604050900_add_learn_visibility_and_task_canvas_links.sql`
- `supabase/migrations/20260406_add_module_resource_study_state.sql`
- `supabase/migrations/20260407_add_module_resource_study_last_opened_at.sql`
- `supabase/migrations/20260408_add_module_terms.sql`
- `supabase/migrations/20260409_add_task_canvas_completion_metadata.sql`

That migration creates:

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

The module delete flow is defensive if `module_resources` is missing, but the proper fix is still to apply the migration to the active Supabase environment.
