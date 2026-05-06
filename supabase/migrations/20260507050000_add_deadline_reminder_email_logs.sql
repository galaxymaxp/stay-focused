create table if not exists public.deadline_reminder_email_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('task', 'deadline')),
  source_id uuid not null,
  reminder_window text not null check (reminder_window in ('due_tomorrow', 'due_today')),
  sent_to text not null,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists deadline_reminder_email_logs_dedupe_idx
  on public.deadline_reminder_email_logs(user_id, source_type, source_id, reminder_window);

create index if not exists deadline_reminder_email_logs_user_sent_idx
  on public.deadline_reminder_email_logs(user_id, sent_at desc);

alter table public.deadline_reminder_email_logs enable row level security;

create policy "users_select_own_deadline_reminder_email_logs"
  on public.deadline_reminder_email_logs for select
  to authenticated
  using (auth.uid() = user_id);

create policy "service_role_manage_deadline_reminder_email_logs"
  on public.deadline_reminder_email_logs for all
  to service_role
  using (true)
  with check (true);

notify pgrst, 'reload schema';
