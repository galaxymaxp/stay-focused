alter table if exists public.study_outputs
  add column if not exists source_task_id uuid references public.tasks(id) on delete cascade;

drop index if exists study_outputs_user_source_note_kind_uidx;

create unique index if not exists study_outputs_user_source_note_kind_uidx
  on public.study_outputs(user_id, output_kind, source_note_id)
  where source_note_id is not null;

create index if not exists study_outputs_user_task_kind_idx
  on public.study_outputs(user_id, source_task_id, output_kind, updated_at desc)
  where source_task_id is not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'study_outputs_source_kind_check'
  ) then
    alter table public.study_outputs
      drop constraint study_outputs_source_kind_check;
  end if;
exception
  when undefined_table then null;
end
$$;

alter table if exists public.study_outputs
  add constraint study_outputs_source_kind_check
  check (source_kind in ('deep_learn_note', 'task'));

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'study_outputs_output_kind_check'
  ) then
    alter table public.study_outputs
      drop constraint study_outputs_output_kind_check;
  end if;
exception
  when undefined_table then null;
end
$$;

alter table if exists public.study_outputs
  add constraint study_outputs_output_kind_check
  check (output_kind in ('reviewer', 'quiz_pack', 'task_output', 'study_sheet', 'cram_sheet'));
