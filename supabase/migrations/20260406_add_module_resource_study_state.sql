create table if not exists public.module_resource_study_state (
  module_id uuid not null references public.modules(id) on delete cascade,
  resource_id text not null,
  study_progress_status text not null default 'not_started'
    check (study_progress_status in ('not_started', 'skimmed', 'reviewed')),
  workflow_override text not null default 'study'
    check (workflow_override in ('study', 'activity')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (module_id, resource_id)
);

create index if not exists module_resource_study_state_module_id_idx
  on public.module_resource_study_state(module_id);

create index if not exists module_resource_study_state_workflow_override_idx
  on public.module_resource_study_state(workflow_override);
