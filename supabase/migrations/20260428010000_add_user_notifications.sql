create type public.notification_type as enum (
  'queue_completed', 'queue_failed',
  'sync_completed',
  'new_module', 'new_resource', 'new_task',
  'due_soon'
);

create type public.notification_severity as enum ('info', 'success', 'warning', 'error');

create table public.user_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        public.notification_type not null,
  title       text not null,
  body        text,
  href        text,
  severity    public.notification_severity not null default 'info',
  metadata    jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index user_notifications_user_id_idx    on public.user_notifications(user_id);
create index user_notifications_created_at_idx on public.user_notifications(created_at desc);
create index user_notifications_read_at_idx    on public.user_notifications(read_at) where read_at is null;

alter table public.user_notifications enable row level security;

create policy "Users can read own notifications"
on public.user_notifications for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can mark own notifications read"
on public.user_notifications for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Service role can insert notifications"
on public.user_notifications for insert
to service_role
with check (true);

-- Allow authenticated inserts for server-action context (uses anon key + session)
create policy "Authenticated can insert own notifications"
on public.user_notifications for insert
to authenticated
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';
