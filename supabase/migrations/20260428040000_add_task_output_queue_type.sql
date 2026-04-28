alter type public.queued_job_type add value if not exists 'task_output';

notify pgrst, 'reload schema';
