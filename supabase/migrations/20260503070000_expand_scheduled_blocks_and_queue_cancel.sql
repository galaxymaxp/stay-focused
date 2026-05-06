alter table public.scheduled_blocks
  add column if not exists source_type text,
  add column if not exists course_id uuid references public.courses(id) on delete set null,
  add column if not exists subtitle text,
  add column if not exists block_type text
    check (block_type is null or block_type in (
      'assignment',
      'learning_material',
      'module_review',
      'quiz_practice',
      'reading',
      'drafting',
      'break'
    )),
  add column if not exists estimate_confidence numeric(4,2),
  add column if not exists estimate_reason text;

update public.scheduled_blocks
set source_type = coalesce(source_type, source_table),
    block_type = coalesce(
      block_type,
      case
        when source_table = 'modules' then 'module_review'
        when source_table = 'module_resources' then 'learning_material'
        when source_table = 'learning_items' then 'quiz_practice'
        else 'assignment'
      end
    ),
    estimate_confidence = coalesce(estimate_confidence, 0.45),
    estimate_reason = coalesce(estimate_reason, 'Estimated from earlier schedule rules')
where source_type is null
   or block_type is null
   or estimate_confidence is null
   or estimate_reason is null;

create index if not exists scheduled_blocks_user_course_idx
  on public.scheduled_blocks(user_id, course_id);

create index if not exists scheduled_blocks_user_block_type_idx
  on public.scheduled_blocks(user_id, block_type);

alter table public.queued_jobs
  add column if not exists cancel_requested_at timestamptz,
  add column if not exists canceled_at timestamptz;

create index if not exists queued_jobs_cancel_requested_at_idx
  on public.queued_jobs(cancel_requested_at);

create index if not exists queued_jobs_canceled_at_idx
  on public.queued_jobs(canceled_at);

drop policy if exists "Users can cancel own pending queued_jobs" on public.queued_jobs;
drop policy if exists "Users can cancel own active queued_jobs" on public.queued_jobs;

create policy "Users can cancel own active queued_jobs"
on public.queued_jobs for update
to authenticated
using (auth.uid() = user_id and status in ('pending', 'running'))
with check (
  auth.uid() = user_id
  and status = 'cancelled'
  and cancel_requested_at is not null
  and canceled_at is not null
);

notify pgrst, 'reload schema';

