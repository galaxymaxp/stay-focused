grant select on public.task_refresh_activity to authenticated;

notify pgrst, 'reload schema';
