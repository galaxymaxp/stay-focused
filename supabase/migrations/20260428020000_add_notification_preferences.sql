-- Add email notification preference columns to user_settings
alter table public.user_settings
  add column if not exists email_notifications text not null default 'off'
    check (email_notifications in ('off', 'instant', 'daily_digest')),
  add column if not exists email_categories jsonb not null default '{"due_soon":true,"new_uploads":true,"announcements":false,"queue_completed":true}'::jsonb;

notify pgrst, 'reload schema';
