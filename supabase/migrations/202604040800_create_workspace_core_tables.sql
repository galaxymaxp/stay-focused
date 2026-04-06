create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.courses (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null,
  name text not null,
  term text not null default 'Current term',
  instructor text not null default 'Course staff',
  focus_label text not null default 'Synced from Canvas',
  color_token text not null default 'blue'
    check (color_token in ('yellow', 'orange', 'blue', 'green')),
  created_at timestamptz not null default now()
);

create table if not exists public.modules (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  title text not null,
  raw_content text not null default '',
  summary text,
  concepts text[] not null default '{}'::text[],
  study_prompts text[] not null default '{}'::text[],
  recommended_order text[] not null default '{}'::text[],
  status text not null default 'pending'
    check (status in ('pending', 'processed', 'error')),
  "order" integer not null default 0,
  released_at timestamptz,
  estimated_minutes integer,
  priority_signal text
    check (priority_signal in ('high', 'medium', 'low')),
  show_in_learn boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.learning_items (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  body text not null default '',
  type text not null
    check (type in ('summary', 'concept', 'connection', 'review')),
  "order" integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.task_items (
  id uuid primary key default extensions.gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  deadline timestamptz,
  task_type text not null default 'assignment'
    check (task_type in ('assignment', 'quiz', 'reading', 'prep', 'discussion', 'project')),
  estimated_minutes integer not null default 20,
  extracted_from text,
  canvas_url text,
  canvas_assignment_id bigint,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default extensions.gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  details text,
  deadline timestamptz,
  canvas_url text,
  canvas_assignment_id bigint,
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  status text not null default 'pending'
    check (status in ('pending', 'completed')),
  completion_origin text
    check (completion_origin in ('manual', 'canvas')),
  created_at timestamptz not null default now()
);

create table if not exists public.deadlines (
  id uuid primary key default extensions.gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  label text not null,
  date timestamptz not null,
  created_at timestamptz not null default now()
);

create unique index if not exists courses_code_name_uidx
  on public.courses(code, name);

create index if not exists modules_course_id_idx
  on public.modules(course_id);

create index if not exists modules_status_idx
  on public.modules(status);

create index if not exists modules_show_in_learn_idx
  on public.modules(show_in_learn);

create index if not exists learning_items_course_id_idx
  on public.learning_items(course_id);

create index if not exists learning_items_module_id_idx
  on public.learning_items(module_id);

create index if not exists learning_items_module_order_idx
  on public.learning_items(module_id, "order");

create index if not exists task_items_course_id_idx
  on public.task_items(course_id);

create index if not exists task_items_module_id_idx
  on public.task_items(module_id);

create index if not exists task_items_deadline_idx
  on public.task_items(deadline);

create index if not exists task_items_status_idx
  on public.task_items(status);

create index if not exists task_items_canvas_assignment_id_idx
  on public.task_items(canvas_assignment_id);

create index if not exists tasks_module_id_idx
  on public.tasks(module_id);

create index if not exists tasks_deadline_idx
  on public.tasks(deadline);

create index if not exists tasks_status_idx
  on public.tasks(status);

create index if not exists tasks_canvas_assignment_id_idx
  on public.tasks(canvas_assignment_id);

create index if not exists deadlines_module_id_idx
  on public.deadlines(module_id);

create index if not exists deadlines_date_idx
  on public.deadlines(date);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

alter table public.courses disable row level security;
alter table public.modules disable row level security;
alter table public.learning_items disable row level security;
alter table public.task_items disable row level security;
alter table public.tasks disable row level security;
alter table public.deadlines disable row level security;
