alter table if exists public.modules
  add column if not exists show_in_learn boolean not null default true;

alter table if exists public.task_items
  add column if not exists canvas_url text;

alter table if exists public.tasks
  add column if not exists canvas_url text;

create index if not exists modules_show_in_learn_idx on public.modules(show_in_learn);
