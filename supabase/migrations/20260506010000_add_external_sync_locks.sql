create table if not exists public.external_sync_locks (
  lock_key text primary key,
  owner text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists external_sync_locks_expires_at_idx
  on public.external_sync_locks(expires_at);

create or replace function public.touch_external_sync_locks_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists external_sync_locks_updated_at_trigger on public.external_sync_locks;
create trigger external_sync_locks_updated_at_trigger
  before update on public.external_sync_locks
  for each row execute function public.touch_external_sync_locks_updated_at();

create or replace function public.try_acquire_external_sync_lock(
  p_lock_key text,
  p_owner text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
as $$
declare
  affected_count integer;
begin
  insert into public.external_sync_locks(lock_key, owner, expires_at)
  values (p_lock_key, p_owner, p_expires_at)
  on conflict (lock_key) do update
    set owner = excluded.owner,
        expires_at = excluded.expires_at
    where public.external_sync_locks.expires_at <= now();

  get diagnostics affected_count = row_count;
  return affected_count > 0;
end;
$$;

alter table public.external_sync_locks enable row level security;

drop policy if exists "Service role can manage external sync locks" on public.external_sync_locks;
create policy "Service role can manage external sync locks"
on public.external_sync_locks
for all
to service_role
using (true)
with check (true);

notify pgrst, 'reload schema';
