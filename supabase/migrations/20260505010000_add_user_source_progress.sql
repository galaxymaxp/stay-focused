create table if not exists public.user_source_progress (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null,
  source_id uuid not null,
  status text not null default 'active' check (status in ('active', 'completed', 'reviewed', 'later')),
  reviewed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint user_source_progress_unique unique (user_id, source_table, source_id)
);

create index if not exists user_source_progress_user_idx on public.user_source_progress(user_id, source_table, status);

alter table public.user_source_progress enable row level security;

drop policy if exists "Users can manage own source progress" on public.user_source_progress;
create policy "Users can manage own source progress"
on public.user_source_progress
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
