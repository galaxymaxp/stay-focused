alter table public.module_resources
  add column if not exists canvas_instance_url text,
  add column if not exists canvas_course_id bigint;

update public.module_resources mr
set canvas_instance_url = coalesce(mr.canvas_instance_url, c.canvas_instance_url),
    canvas_course_id = coalesce(mr.canvas_course_id, c.canvas_course_id)
from public.courses c
where mr.course_id = c.id
  and (mr.canvas_instance_url is null or mr.canvas_course_id is null);

create index if not exists module_resources_canvas_file_id_idx
  on public.module_resources(canvas_file_id)
  where canvas_file_id is not null;

create index if not exists module_resources_canvas_course_file_idx
  on public.module_resources(canvas_instance_url, canvas_course_id, canvas_file_id)
  where canvas_instance_url is not null
    and canvas_course_id is not null
    and canvas_file_id is not null;
