alter table if exists public.learning_items
  add column if not exists source_type text,
  add column if not exists canonical_source_id text,
  add column if not exists source_module_id uuid references public.modules(id) on delete set null,
  add column if not exists source_resource_id uuid references public.module_resources(id) on delete set null,
  add column if not exists source_label text,
  add column if not exists source_repair_status text,
  add column if not exists source_repair_note text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists learning_items_source_resource_idx
  on public.learning_items(source_resource_id)
  where source_resource_id is not null;

create index if not exists learning_items_canonical_source_idx
  on public.learning_items(canonical_source_id)
  where canonical_source_id is not null;
