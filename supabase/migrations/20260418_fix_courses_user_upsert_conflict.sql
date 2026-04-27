with ranked_courses as (
  select
    id,
    first_value(id) over (
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where user_id is not null
    and canvas_instance_url is not null
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
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where user_id is not null
    and canvas_instance_url is not null
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
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where user_id is not null
    and canvas_instance_url is not null
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
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where user_id is not null
    and canvas_instance_url is not null
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
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as canonical_course_id,
    row_number() over (
      partition by user_id, canvas_instance_url, canvas_course_id
      order by created_at asc, id asc
    ) as course_rank
  from public.courses
  where user_id is not null
    and canvas_instance_url is not null
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

drop index if exists public.courses_user_canvas_instance_course_uidx;

create unique index if not exists courses_user_canvas_instance_course_uidx
  on public.courses(user_id, canvas_instance_url, canvas_course_id);
