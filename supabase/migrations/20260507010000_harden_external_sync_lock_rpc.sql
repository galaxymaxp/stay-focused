create or replace function public.touch_external_sync_locks_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.try_acquire_external_sync_lock(
  p_lock_key text,
  p_owner text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
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

revoke execute on function public.try_acquire_external_sync_lock(text, text, timestamptz)
  from public, anon, authenticated;

grant execute on function public.try_acquire_external_sync_lock(text, text, timestamptz)
  to service_role;

notify pgrst, 'reload schema';
