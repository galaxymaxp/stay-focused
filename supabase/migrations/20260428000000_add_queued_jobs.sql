-- Queued jobs table for async background processing
create type public.queued_job_status as enum (
  'pending', 'running', 'completed', 'failed', 'cancelled'
);

create type public.queued_job_type as enum (
  'canvas_sync', 'learn_generation', 'do_generation',
  'resource_extraction', 'notification_scan'
);

create table public.queued_jobs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           public.queued_job_type not null,
  title          text not null,
  status         public.queued_job_status not null default 'pending',
  progress       int not null default 0,
  payload        jsonb,
  result         jsonb,
  error          text,
  attempts       int not null default 0,
  max_attempts   int not null default 3,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  started_at     timestamptz,
  completed_at   timestamptz,

  constraint queued_jobs_progress_range check (progress >= 0 and progress <= 100)
);

create index queued_jobs_user_id_idx   on public.queued_jobs(user_id);
create index queued_jobs_status_idx    on public.queued_jobs(status);
create index queued_jobs_type_idx      on public.queued_jobs(type);
create index queued_jobs_created_at_idx on public.queued_jobs(created_at desc);

alter table public.queued_jobs enable row level security;

-- Users read their own jobs
create policy "Users can read own queued_jobs"
on public.queued_jobs for select
to authenticated
using (auth.uid() = user_id);

-- Users insert their own jobs
create policy "Users can create own queued_jobs"
on public.queued_jobs for insert
to authenticated
with check (auth.uid() = user_id);

-- Users can cancel pending jobs they own
create policy "Users can cancel own pending queued_jobs"
on public.queued_jobs for update
to authenticated
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id and status = 'cancelled');

-- Service role processes jobs (background workers / API routes with service key)
create policy "Service role can update queued_jobs"
on public.queued_jobs for update
to service_role
using (true)
with check (true);

-- auto-update updated_at
create or replace function public.touch_queued_jobs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger queued_jobs_updated_at_trigger
  before update on public.queued_jobs
  for each row execute function public.touch_queued_jobs_updated_at();

notify pgrst, 'reload schema';
