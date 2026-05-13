drop index if exists public.study_outputs_user_source_note_kind_uidx;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'study_outputs_user_source_note_kind_key'
  ) then
    alter table public.study_outputs
      add constraint study_outputs_user_source_note_kind_key
      unique (user_id, output_kind, source_note_id);
  end if;
end
$$;
