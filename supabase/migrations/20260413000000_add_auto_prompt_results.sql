create table if not exists public.auto_prompt_results (
  id uuid primary key default extensions.gen_random_uuid(),
  user_key text not null,
  source_key text not null,
  content_hash text not null,
  prompt_text text not null,
  output_json jsonb not null,
  output_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists auto_prompt_results_user_source_hash_uidx
  on public.auto_prompt_results(user_key, source_key, content_hash);

create index if not exists auto_prompt_results_user_source_updated_idx
  on public.auto_prompt_results(user_key, source_key, updated_at desc);

grant all on table public.auto_prompt_results to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

alter table public.auto_prompt_results disable row level security;
