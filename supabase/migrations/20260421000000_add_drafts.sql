create table if not exists public.drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('module', 'upload', 'paste')),
  source_module_id uuid references public.modules(id) on delete set null,
  source_resource_id uuid references public.module_resources(id) on delete set null,
  source_file_path text,
  source_raw_content text not null default '',
  source_title text not null,
  draft_type text not null check (draft_type in ('exam_reviewer', 'study_notes', 'summary', 'flashcard_set')),
  title text not null,
  body_markdown text not null default '',
  status text not null check (status in ('generating', 'ready', 'refining', 'failed')) default 'generating',
  refinement_history jsonb not null default '[]'::jsonb,
  token_count int,
  generation_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.drafts
  add column if not exists source_resource_id uuid references public.module_resources(id) on delete set null;

create index if not exists drafts_user_status_idx
  on public.drafts(user_id, status, updated_at desc);

create index if not exists drafts_user_type_idx
  on public.drafts(user_id, draft_type, updated_at desc);

create index if not exists drafts_user_source_resource_idx
  on public.drafts(user_id, source_module_id, source_resource_id, updated_at desc)
  where source_resource_id is not null;

create unique index if not exists drafts_user_source_resource_unique_idx
  on public.drafts(user_id, source_module_id, source_resource_id)
  where source_resource_id is not null;

create or replace function public.set_drafts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_drafts_updated_at on public.drafts;
create trigger set_drafts_updated_at
before update on public.drafts
for each row
execute function public.set_drafts_updated_at();

alter table public.drafts enable row level security;

drop policy if exists "Users can read own drafts." on public.drafts;
create policy "Users can read own drafts."
  on public.drafts
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own drafts." on public.drafts;
create policy "Users can insert own drafts."
  on public.drafts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own drafts." on public.drafts;
create policy "Users can update own drafts."
  on public.drafts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own drafts." on public.drafts;
create policy "Users can delete own drafts."
  on public.drafts
  for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.drafts to authenticated;
