alter table public.courses
  add column if not exists canvas_instance_url text,
  add column if not exists canvas_course_id bigint;

with candidate_urls as (
  select
    course_id,
    regexp_replace(substring(candidate_url from '^(https?://[^/]+)'), '/$', '') as canvas_instance_url,
    nullif(substring(candidate_url from '/courses/([0-9]+)'), '')::bigint as canvas_course_id,
    priority,
    created_at
  from (
    select
      ti.course_id,
      ti.canvas_url as candidate_url,
      1 as priority,
      ti.created_at
    from public.task_items ti
    where ti.course_id is not null
      and ti.canvas_url is not null

    union all

    select
      m.course_id,
      t.canvas_url as candidate_url,
      2 as priority,
      t.created_at
    from public.tasks t
    join public.modules m on m.id = t.module_id
    where m.course_id is not null
      and t.canvas_url is not null

    union all

    select
      coalesce(mr.course_id, m.course_id) as course_id,
      mr.html_url as candidate_url,
      3 as priority,
      mr.created_at
    from public.module_resources mr
    left join public.modules m on m.id = mr.module_id
    where coalesce(mr.course_id, m.course_id) is not null
      and mr.html_url is not null

    union all

    select
      coalesce(mr.course_id, m.course_id) as course_id,
      mr.source_url as candidate_url,
      4 as priority,
      mr.created_at
    from public.module_resources mr
    left join public.modules m on m.id = mr.module_id
    where coalesce(mr.course_id, m.course_id) is not null
      and mr.source_url is not null
  ) raw_candidates
  where substring(candidate_url from '^(https?://[^/]+)') is not null
    and substring(candidate_url from '/courses/([0-9]+)') is not null
),
backfilled_courses as (
  select distinct on (course_id)
    course_id,
    canvas_instance_url,
    canvas_course_id
  from candidate_urls
  order by course_id, priority asc, created_at asc
)
update public.courses c
set canvas_instance_url = coalesce(c.canvas_instance_url, b.canvas_instance_url),
    canvas_course_id = coalesce(c.canvas_course_id, b.canvas_course_id)
from backfilled_courses b
where c.id = b.course_id
  and (c.canvas_instance_url is null or c.canvas_course_id is null);

with ranked_courses as (
  select
    id,
    first_value(id) over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where canvas_instance_url is not null
    and canvas_course_id is not null
),
duplicate_courses as (
  select
    id as duplicate_course_id,
    canonical_course_id
  from ranked_courses
  where course_rank > 1
)
update public.modules m
set course_id = d.canonical_course_id
from duplicate_courses d
where m.course_id = d.duplicate_course_id;

with ranked_courses as (
  select
    id,
    first_value(id) over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where canvas_instance_url is not null
    and canvas_course_id is not null
),
duplicate_courses as (
  select
    id as duplicate_course_id,
    canonical_course_id
  from ranked_courses
  where course_rank > 1
)
update public.learning_items li
set course_id = d.canonical_course_id
from duplicate_courses d
where li.course_id = d.duplicate_course_id;

with ranked_courses as (
  select
    id,
    first_value(id) over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where canvas_instance_url is not null
    and canvas_course_id is not null
),
duplicate_courses as (
  select
    id as duplicate_course_id,
    canonical_course_id
  from ranked_courses
  where course_rank > 1
)
update public.task_items ti
set course_id = d.canonical_course_id
from duplicate_courses d
where ti.course_id = d.duplicate_course_id;

with ranked_courses as (
  select
    id,
    first_value(id) over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where canvas_instance_url is not null
    and canvas_course_id is not null
),
duplicate_courses as (
  select
    id as duplicate_course_id,
    canonical_course_id
  from ranked_courses
  where course_rank > 1
)
update public.module_resources mr
set course_id = d.canonical_course_id
from duplicate_courses d
where mr.course_id = d.duplicate_course_id;

with ranked_courses as (
  select
    id,
    first_value(id) over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where canvas_instance_url is not null
    and canvas_course_id is not null
),
duplicate_courses as (
  select
    id as duplicate_course_id,
    canonical_course_id
  from ranked_courses
  where course_rank > 1
)
delete from public.courses c
using duplicate_courses d
where c.id = d.duplicate_course_id;

drop index if exists public.courses_code_name_uidx;

create unique index if not exists courses_canvas_instance_course_uidx
  on public.courses(canvas_instance_url, canvas_course_id);

create index if not exists courses_canvas_course_id_idx
  on public.courses(canvas_course_id);
