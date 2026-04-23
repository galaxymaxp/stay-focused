alter table public.drafts
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists canonical_source_id text;

alter table public.drafts
  drop constraint if exists drafts_source_type_check;

alter table public.drafts
  add constraint drafts_source_type_check
  check (source_type in ('module_resource', 'task', 'module', 'upload', 'paste'));

update public.drafts as d
set course_id = m.course_id
from public.modules as m
where d.source_module_id = m.id
  and d.course_id is null;

update public.drafts
set source_type = 'module_resource'
where source_type = 'module'
  and source_resource_id is not null;

update public.drafts
set canonical_source_id = case
  when source_type = 'task' and source_file_path is not null then 'task-fallback:' || source_file_path
  when source_type = 'task' then 'task-fallback:' || id::text
  when source_resource_id is not null then 'resource:' || source_resource_id::text
  when source_module_id is not null then 'module:' || source_module_id::text
  else 'legacy:' || id::text
end
where canonical_source_id is null;

alter table public.drafts
  alter column canonical_source_id set not null;

create index if not exists drafts_user_canonical_source_idx
  on public.drafts(user_id, canonical_source_id, updated_at desc);

create unique index if not exists drafts_user_canonical_source_unique_idx
  on public.drafts(user_id, canonical_source_id);
