alter table if exists public.tasks
  add column if not exists canvas_assignment_id bigint;

alter table if exists public.tasks
  add column if not exists completion_origin text;

alter table if exists public.task_items
  add column if not exists canvas_assignment_id bigint;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_completion_origin_check'
  ) then
    alter table public.tasks
      add constraint tasks_completion_origin_check
      check (completion_origin in ('manual', 'canvas'));
  end if;
end
$$;

create index if not exists tasks_canvas_assignment_id_idx
  on public.tasks(canvas_assignment_id);

create index if not exists task_items_canvas_assignment_id_idx
  on public.task_items(canvas_assignment_id);
