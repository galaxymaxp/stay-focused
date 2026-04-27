create table if not exists public.deep_learn_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  resource_id uuid not null references public.module_resources(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'ready', 'failed')),
  title text not null default '',
  overview text not null default '',
  sections jsonb not null default '[]'::jsonb,
  note_body text not null default '',
  core_terms jsonb not null default '[]'::jsonb,
  key_facts jsonb not null default '[]'::jsonb,
  distinctions jsonb not null default '[]'::jsonb,
  likely_quiz_points jsonb not null default '[]'::jsonb,
  caution_notes jsonb not null default '[]'::jsonb,
  source_grounding jsonb not null default '{}'::jsonb,
  quiz_ready boolean not null default false,
  prompt_version text not null default 'v1',
  error_message text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deep_learn_notes_user_module_idx
  on public.deep_learn_notes(user_id, module_id, updated_at desc);

create index if not exists deep_learn_notes_user_resource_idx
  on public.deep_learn_notes(user_id, resource_id, updated_at desc);

create unique index if not exists deep_learn_notes_user_resource_uidx
  on public.deep_learn_notes(user_id, resource_id);

create or replace function public.set_deep_learn_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_deep_learn_notes_updated_at on public.deep_learn_notes;
create trigger set_deep_learn_notes_updated_at
before update on public.deep_learn_notes
for each row
execute function public.set_deep_learn_notes_updated_at();

alter table public.deep_learn_notes enable row level security;

drop policy if exists "Users can read own Deep Learn notes." on public.deep_learn_notes;
create policy "Users can read own Deep Learn notes."
  on public.deep_learn_notes
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own Deep Learn notes." on public.deep_learn_notes;
create policy "Users can insert own Deep Learn notes."
  on public.deep_learn_notes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own Deep Learn notes." on public.deep_learn_notes;
create policy "Users can update own Deep Learn notes."
  on public.deep_learn_notes
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own Deep Learn notes." on public.deep_learn_notes;
create policy "Users can delete own Deep Learn notes."
  on public.deep_learn_notes
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.deep_learn_notes to authenticated;
