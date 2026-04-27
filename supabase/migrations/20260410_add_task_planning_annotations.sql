alter table if exists public.task_items
  add column if not exists completion_origin text;

alter table if exists public.task_items
  add column if not exists planning_annotation text;

alter table if exists public.tasks
  add column if not exists planning_annotation text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_items_completion_origin_check'
  ) then
    alter table public.task_items
      add constraint task_items_completion_origin_check
      check (completion_origin in ('manual', 'canvas'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_items_planning_annotation_check'
  ) then
    alter table public.task_items
      add constraint task_items_planning_annotation_check
      check (planning_annotation in ('best_next_step', 'needs_attention', 'worth_reviewing'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_planning_annotation_check'
  ) then
    alter table public.tasks
      add constraint tasks_planning_annotation_check
      check (planning_annotation in ('best_next_step', 'needs_attention', 'worth_reviewing'));
  end if;
end
$$;

create index if not exists task_items_completion_origin_idx
  on public.task_items(completion_origin);

create index if not exists task_items_planning_annotation_idx
  on public.task_items(planning_annotation);

create index if not exists tasks_planning_annotation_idx
  on public.tasks(planning_annotation);
