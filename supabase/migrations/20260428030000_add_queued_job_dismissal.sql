-- Queue notification dismissal. Generated results remain in their own tables.
alter table public.queued_jobs
  add column if not exists dismissed_at timestamptz;

create index if not exists queued_jobs_dismissed_at_idx
on public.queued_jobs(dismissed_at);

drop policy if exists "Users can dismiss own terminal queued_jobs" on public.queued_jobs;
create policy "Users can dismiss own terminal queued_jobs"
on public.queued_jobs for update
to authenticated
using (auth.uid() = user_id and status in ('completed', 'failed', 'cancelled'))
with check (auth.uid() = user_id and status in ('completed', 'failed', 'cancelled') and dismissed_at is not null);

notify pgrst, 'reload schema';
