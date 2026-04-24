alter table public.courses
  add column if not exists ai_summary text,
  add column if not exists ai_summary_source_hash text,
  add column if not exists ai_summary_generated_at timestamptz;

create index if not exists courses_user_ai_summary_generated_at_idx
  on public.courses(user_id, ai_summary_generated_at desc)
  where ai_summary_generated_at is not null;
