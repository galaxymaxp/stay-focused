update public.auto_prompt_results
set user_id = substring(user_key from '^auth:([0-9a-fA-F-]{36})$')::uuid
where user_id is null
  and user_key ~ '^auth:[0-9a-fA-F-]{8}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{4}-[0-9a-fA-F-]{12}$';

revoke all on table public.auto_prompt_results from anon, authenticated;
grant all on table public.auto_prompt_results to service_role;

alter table public.auto_prompt_results enable row level security;

drop policy if exists auto_prompt_results_authenticated_select on public.auto_prompt_results;
create policy auto_prompt_results_authenticated_select
  on public.auto_prompt_results
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists auto_prompt_results_authenticated_insert on public.auto_prompt_results;
create policy auto_prompt_results_authenticated_insert
  on public.auto_prompt_results
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and user_key = ('auth:' || auth.uid()::text)
  );

drop policy if exists auto_prompt_results_authenticated_update on public.auto_prompt_results;
create policy auto_prompt_results_authenticated_update
  on public.auto_prompt_results
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and user_key = ('auth:' || auth.uid()::text)
  );

drop policy if exists auto_prompt_results_authenticated_delete on public.auto_prompt_results;
create policy auto_prompt_results_authenticated_delete
  on public.auto_prompt_results
  for delete
  to authenticated
  using (user_id = auth.uid());

create or replace function public.get_auto_prompt_result_for_request(
  p_user_key text,
  p_source_key text,
  p_content_hash text
)
returns table (
  user_id uuid,
  user_key text,
  source_key text,
  content_hash text,
  prompt_text text,
  output_json jsonb,
  output_text text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    apr.user_id,
    apr.user_key,
    apr.source_key,
    apr.content_hash,
    apr.prompt_text,
    apr.output_json,
    apr.output_text,
    apr.created_at,
    apr.updated_at
  from public.auto_prompt_results as apr
  where apr.user_key = case
    when auth.uid() is not null then 'auth:' || auth.uid()::text
    else p_user_key
  end
    and apr.source_key = p_source_key
    and apr.content_hash = p_content_hash
    and (
      (auth.uid() is null and apr.user_id is null)
      or apr.user_id = auth.uid()
    )
  order by apr.updated_at desc
  limit 1;
$$;

create or replace function public.get_legacy_anonymous_auto_prompt_result(
  p_user_key text,
  p_source_key text,
  p_content_hash text
)
returns table (
  user_id uuid,
  user_key text,
  source_key text,
  content_hash text,
  prompt_text text,
  output_json jsonb,
  output_text text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    apr.user_id,
    apr.user_key,
    apr.source_key,
    apr.content_hash,
    apr.prompt_text,
    apr.output_json,
    apr.output_text,
    apr.created_at,
    apr.updated_at
  from public.auto_prompt_results as apr
  where apr.user_id is null
    and apr.user_key = p_user_key
    and apr.source_key = p_source_key
    and apr.content_hash = p_content_hash
  order by apr.updated_at desc
  limit 1;
$$;

create or replace function public.upsert_auto_prompt_result_for_request(
  p_user_key text,
  p_source_key text,
  p_content_hash text,
  p_prompt_text text,
  p_output_json jsonb,
  p_output_text text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_user_id uuid := auth.uid();
  resolved_user_key text := case
    when resolved_user_id is not null then 'auth:' || resolved_user_id::text
    else p_user_key
  end;
begin
  insert into public.auto_prompt_results (
    user_id,
    user_key,
    source_key,
    content_hash,
    prompt_text,
    output_json,
    output_text,
    updated_at
  )
  values (
    resolved_user_id,
    resolved_user_key,
    p_source_key,
    p_content_hash,
    p_prompt_text,
    p_output_json,
    p_output_text,
    now()
  )
  on conflict (user_key, source_key, content_hash)
  do update
  set
    user_id = excluded.user_id,
    prompt_text = excluded.prompt_text,
    output_json = excluded.output_json,
    output_text = excluded.output_text,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_auto_prompt_result_for_request(text, text, text) from public;
revoke all on function public.get_legacy_anonymous_auto_prompt_result(text, text, text) from public;
revoke all on function public.upsert_auto_prompt_result_for_request(text, text, text, text, jsonb, text) from public;

grant execute on function public.get_auto_prompt_result_for_request(text, text, text) to anon, authenticated, service_role;
grant execute on function public.get_legacy_anonymous_auto_prompt_result(text, text, text) to authenticated, service_role;
grant execute on function public.upsert_auto_prompt_result_for_request(text, text, text, text, jsonb, text) to anon, authenticated, service_role;
