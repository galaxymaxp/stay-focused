alter table public.auto_prompt_results
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists auto_prompt_results_user_id_source_updated_idx
  on public.auto_prompt_results(user_id, source_key, updated_at desc);
