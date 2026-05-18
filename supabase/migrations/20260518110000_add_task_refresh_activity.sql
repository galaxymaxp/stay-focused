create table if not exists public.task_refresh_activity (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  status text not null
    check (status in ('completed', 'warning', 'failed')),
  detail text not null,
  warnings jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_refresh_activity_user_created_idx
  on public.task_refresh_activity(user_id, created_at desc);

create index if not exists task_refresh_activity_course_created_idx
  on public.task_refresh_activity(course_id, created_at desc);

alter table public.task_refresh_activity enable row level security;

drop policy if exists "Users can read own task refresh activity" on public.task_refresh_activity;
create policy "Users can read own task refresh activity"
on public.task_refresh_activity
for select
using (auth.uid() = user_id);
