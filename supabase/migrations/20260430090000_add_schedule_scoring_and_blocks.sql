create table if not exists public.scheduled_blocks (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_table text not null check (source_table in ('task_items', 'tasks', 'deadlines', 'modules', 'module_resources', 'learning_items')),
  source_id uuid,
  title text not null,
  notes text,
  status text not null default 'scheduled' check (status in ('scheduled', 'opened', 'completed', 'skipped')),
  start_at timestamptz not null,
  end_at timestamptz not null,
  estimated_minutes integer not null default 25 check (estimated_minutes > 0),
  schedule_priority_score numeric(6,2),
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

create index if not exists scheduled_blocks_user_start_idx on public.scheduled_blocks(user_id, start_at);
create index if not exists scheduled_blocks_user_status_idx on public.scheduled_blocks(user_id, status);

alter table public.scheduled_blocks enable row level security;

drop policy if exists "Users can manage own scheduled_blocks" on public.scheduled_blocks;
create policy "Users can manage own scheduled_blocks"
on public.scheduled_blocks
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.tasks
  add column if not exists importance_score numeric(5,2),
  add column if not exists urgency_score numeric(5,2),
  add column if not exists estimated_minutes integer,
  add column if not exists difficulty_score numeric(5,2),
  add column if not exists freshness_score numeric(5,2),
  add column if not exists schedule_priority_score numeric(6,2),
  add column if not exists scoring_reason text,
  add column if not exists estimation_confidence numeric(4,2),
  add column if not exists last_scored_at timestamptz;

alter table public.task_items
  add column if not exists importance_score numeric(5,2),
  add column if not exists urgency_score numeric(5,2),
  add column if not exists difficulty_score numeric(5,2),
  add column if not exists freshness_score numeric(5,2),
  add column if not exists schedule_priority_score numeric(6,2),
  add column if not exists scoring_reason text,
  add column if not exists estimation_confidence numeric(4,2),
  add column if not exists last_scored_at timestamptz;

alter table public.deadlines
  add column if not exists importance_score numeric(5,2),
  add column if not exists urgency_score numeric(5,2),
  add column if not exists estimated_minutes integer,
  add column if not exists difficulty_score numeric(5,2),
  add column if not exists freshness_score numeric(5,2),
  add column if not exists schedule_priority_score numeric(6,2),
  add column if not exists scoring_reason text,
  add column if not exists estimation_confidence numeric(4,2),
  add column if not exists last_scored_at timestamptz;

alter table public.modules
  add column if not exists importance_score numeric(5,2),
  add column if not exists urgency_score numeric(5,2),
  add column if not exists difficulty_rating numeric(5,2),
  add column if not exists freshness_score numeric(5,2),
  add column if not exists schedule_priority_score numeric(6,2),
  add column if not exists scoring_reason text,
  add column if not exists estimation_confidence numeric(4,2),
  add column if not exists last_scored_at timestamptz;

alter table public.module_resources
  add column if not exists importance_score numeric(5,2),
  add column if not exists urgency_score numeric(5,2),
  add column if not exists estimated_minutes integer,
  add column if not exists difficulty_score numeric(5,2),
  add column if not exists freshness_score numeric(5,2),
  add column if not exists schedule_priority_score numeric(6,2),
  add column if not exists scoring_reason text,
  add column if not exists estimation_confidence numeric(4,2),
  add column if not exists last_scored_at timestamptz;

alter table public.learning_items
  add column if not exists importance_score numeric(5,2),
  add column if not exists urgency_score numeric(5,2),
  add column if not exists estimated_minutes integer,
  add column if not exists difficulty_score numeric(5,2),
  add column if not exists freshness_score numeric(5,2),
  add column if not exists schedule_priority_score numeric(6,2),
  add column if not exists scoring_reason text,
  add column if not exists estimation_confidence numeric(4,2),
  add column if not exists last_scored_at timestamptz;
