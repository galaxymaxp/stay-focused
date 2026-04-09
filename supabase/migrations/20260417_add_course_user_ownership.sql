alter table public.courses
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

drop index if exists public.courses_canvas_instance_course_uidx;

create index if not exists courses_user_id_idx
  on public.courses(user_id);

create unique index if not exists courses_user_canvas_instance_course_uidx
  on public.courses(user_id, canvas_instance_url, canvas_course_id)
  where user_id is not null and canvas_instance_url is not null and canvas_course_id is not null;
