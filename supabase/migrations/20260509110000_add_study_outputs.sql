create table if not exists public.study_outputs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid references public.modules(id) on delete cascade,
  resource_id uuid references public.module_resources(id) on delete cascade,
  source_kind text not null
    check (source_kind in ('deep_learn_note')),
  source_note_id uuid references public.deep_learn_notes(id) on delete cascade,
  output_kind text not null
    check (output_kind in ('reviewer', 'quiz_pack', 'task_output', 'study_sheet')),
  status text not null default 'ready'
    check (status in ('ready', 'failed')),
  title text not null default '',
  summary text not null default '',
  content jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists study_outputs_user_updated_idx
  on public.study_outputs(user_id, updated_at desc);

create index if not exists study_outputs_user_kind_idx
  on public.study_outputs(user_id, output_kind, updated_at desc);

create unique index if not exists study_outputs_user_source_note_kind_uidx
  on public.study_outputs(user_id, output_kind, source_note_id)
  where source_note_id is not null;

create or replace function public.set_study_outputs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_study_outputs_updated_at on public.study_outputs;
create trigger set_study_outputs_updated_at
before update on public.study_outputs
for each row
execute function public.set_study_outputs_updated_at();

alter table public.study_outputs enable row level security;

drop policy if exists "Users can read own study outputs." on public.study_outputs;
create policy "Users can read own study outputs."
  on public.study_outputs
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own study outputs." on public.study_outputs;
create policy "Users can insert own study outputs."
  on public.study_outputs
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own study outputs." on public.study_outputs;
create policy "Users can update own study outputs."
  on public.study_outputs
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own study outputs." on public.study_outputs;
create policy "Users can delete own study outputs."
  on public.study_outputs
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.study_outputs to authenticated;
