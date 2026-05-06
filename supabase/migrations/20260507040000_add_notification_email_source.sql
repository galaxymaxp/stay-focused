-- Add notification_email_source to user_settings.
-- Controls which verified account email receives Canvas digest emails.
-- Allowed values mirror the NotificationEmailSource type in lib/notification-email-options.ts.
-- Defaults to 'supabase_account' (current behavior — no change for existing rows).

alter table public.user_settings
  add column if not exists notification_email_source text
    not null default 'supabase_account'
    check (notification_email_source in ('supabase_account', 'linked_google', 'linked_microsoft'));

notify pgrst, 'reload schema';
