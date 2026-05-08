alter table public.canvas_update_events
  add column if not exists stable_canvas_key text,
  add column if not exists source_url text,
  add column if not exists html_url text,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists sent_at timestamptz,
  add column if not exists skipped_reason text;

update public.canvas_update_events
set stable_canvas_key = concat_ws(
  ':',
  coalesce(canvas_instance_url, ''),
  coalesce(canvas_course_id::text, ''),
  coalesce(source_type, ''),
  coalesce(source_canvas_id, ''),
  coalesce(source_hash, '')
)
where stable_canvas_key is null;

update public.canvas_update_events
set sent_at = digest_sent_at
where sent_at is null
  and digest_sent_at is not null;

create index if not exists canvas_update_events_unsent_user_idx
  on public.canvas_update_events (user_id, occurred_at)
  where digest_sent_at is null;

notify pgrst, 'reload schema';
