alter type public.queued_job_type add value if not exists 'learn_generation';
alter type public.queued_job_type add value if not exists 'source_ocr';

notify pgrst, 'reload schema';
