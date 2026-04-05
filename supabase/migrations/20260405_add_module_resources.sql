create table if not exists public.module_resources (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  canvas_module_id bigint,
  canvas_item_id bigint,
  canvas_file_id bigint,
  title text not null,
  resource_type text not null,
  content_type text,
  extension text,
  source_url text,
  html_url text,
  extraction_status text not null default 'pending' check (extraction_status in ('pending', 'extracted', 'metadata_only', 'unsupported', 'empty', 'failed')),
  extracted_text text,
  extracted_text_preview text,
  extracted_char_count integer not null default 0,
  extraction_error text,
  required boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists module_resources_module_id_idx on public.module_resources(module_id);
create index if not exists module_resources_course_id_idx on public.module_resources(course_id);
create index if not exists module_resources_extraction_status_idx on public.module_resources(extraction_status);

create unique index if not exists module_resources_module_canvas_item_uidx
  on public.module_resources(module_id, canvas_item_id)
  where canvas_item_id is not null;
