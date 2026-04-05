# Supabase Schema Notes

The app expects newer synced-resource tables and columns to exist in the connected Supabase project.

Important migration for attachment-backed Learn:

- `supabase/migrations/20260405_add_module_resources.sql`

That migration creates:

- `public.module_resources`
- indexes used by resource sync and Learn drill-down

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

The module delete flow is defensive if `module_resources` is missing, but the proper fix is still to apply the migration to the active Supabase environment.
