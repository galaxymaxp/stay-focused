alter table if exists public.module_resource_study_state
  add column if not exists last_opened_at timestamptz;

create index if not exists module_resource_study_state_last_opened_at_idx
  on public.module_resource_study_state(module_id, last_opened_at desc);
