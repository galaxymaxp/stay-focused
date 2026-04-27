alter table public.module_resources
  add column if not exists visual_extraction_status text not null default 'not_started',
  add column if not exists visual_extracted_text text,
  add column if not exists visual_extraction_error text,
  add column if not exists page_count integer,
  add column if not exists pages_processed integer not null default 0,
  add column if not exists extraction_provider text;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'module_resources'
      and constraint_name = 'module_resources_visual_extraction_status_check'
  ) then
    alter table public.module_resources
      drop constraint module_resources_visual_extraction_status_check;
  end if;
end $$;

alter table public.module_resources
  add constraint module_resources_visual_extraction_status_check
  check (
    visual_extraction_status in (
      'not_started',
      'available',
      'queued',
      'running',
      'completed',
      'failed',
      'skipped'
    )
  );

update public.module_resources
set
  visual_extraction_status = 'available',
  page_count = coalesce(
    page_count,
    nullif(metadata #>> '{pdfExtraction,pageCount}', '')::integer
  )
where coalesce(extracted_char_count, 0) = 0
  and (
    metadata #>> '{pdfExtraction,errorCode}' = 'pdf_image_only_possible'
    or extraction_error ilike '%pdf_image_only_possible%'
  )
  and visual_extraction_status = 'not_started';
