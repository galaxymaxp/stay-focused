-- Add canvas digest cooldown tracking to user_settings.
-- canvas_digest_last_sent_at records when the most recent digest was sent,
-- used by the app-level cooldown check in lib/canvas-digest.ts.

alter table public.user_settings
  add column if not exists canvas_digest_last_sent_at timestamptz;

notify pgrst, 'reload schema';
