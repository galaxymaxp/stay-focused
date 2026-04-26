do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'module_resources'
      and constraint_name = 'module_resources_extraction_status_check'
  ) then
    alter table public.module_resources
      drop constraint module_resources_extraction_status_check;
  end if;
end $$;

alter table public.module_resources
  add constraint module_resources_extraction_status_check
  check (extraction_status in ('pending', 'extracted', 'completed', 'metadata_only', 'unsupported', 'empty', 'failed'));

notify pgrst, 'reload schema';
