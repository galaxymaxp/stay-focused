create table if not exists public.canvas_update_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  module_id uuid references public.modules(id) on delete set null,
  canvas_instance_url text,
  canvas_course_id bigint,
  event_type text not null,
  title text not null,
  summary text,
  source_type text,
  source_canvas_id text,
  source_hash text,
  app_href text,
  occurred_at timestamptz not null default now(),
  digest_sent_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Stable dedupe index. NULLs in nullable columns are normalised so repeated
-- syncs with the same Canvas entity produce exactly one row per event key.
create unique index if not exists canvas_update_events_dedupe_idx
  on public.canvas_update_events (
    user_id,
    coalesce(canvas_instance_url, ''),
    coalesce(canvas_course_id::text, ''),
    event_type,
    coalesce(source_type, ''),
    coalesce(source_canvas_id, ''),
    coalesce(source_hash, '')
  );

alter table public.canvas_update_events enable row level security;

create policy "users_select_own_canvas_update_events"
  on public.canvas_update_events for select
  to authenticated
  using (auth.uid() = user_id);

create policy "service_role_manage_canvas_update_events"
  on public.canvas_update_events for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
