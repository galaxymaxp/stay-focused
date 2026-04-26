create table if not exists public.resource_summaries (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.module_resources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  topics jsonb not null default '[]'::jsonb,
  study_value text check (study_value in ('high', 'medium', 'low')),
  suggested_use text,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  model text,
  source_hash text,
  error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(resource_id, user_id)
);

create index if not exists resource_summaries_user_resource_idx
  on public.resource_summaries(user_id, resource_id);

create table if not exists public.module_summaries (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  summary text,
  topics jsonb not null default '[]'::jsonb,
  suggested_order jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  model text,
  source_hash text,
  error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(module_id, user_id)
);

create index if not exists module_summaries_user_module_idx
  on public.module_summaries(user_id, module_id);

alter table public.resource_summaries enable row level security;
alter table public.module_summaries enable row level security;

drop policy if exists "Users can read own resource summaries." on public.resource_summaries;
create policy "Users can read own resource summaries."
  on public.resource_summaries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own resource summaries." on public.resource_summaries;
create policy "Users can insert own resource summaries."
  on public.resource_summaries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own resource summaries." on public.resource_summaries;
create policy "Users can update own resource summaries."
  on public.resource_summaries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own module summaries." on public.module_summaries;
create policy "Users can read own module summaries."
  on public.module_summaries for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own module summaries." on public.module_summaries;
create policy "Users can insert own module summaries."
  on public.module_summaries for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own module summaries." on public.module_summaries;
create policy "Users can update own module summaries."
  on public.module_summaries for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
