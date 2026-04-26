alter table public.resource_summaries enable row level security;
alter table public.module_summaries enable row level security;

drop policy if exists "Users can read own resource summaries." on public.resource_summaries;
drop policy if exists "Users can insert own resource summaries." on public.resource_summaries;
drop policy if exists "Users can update own resource summaries." on public.resource_summaries;
drop policy if exists "Users can delete own resource summaries." on public.resource_summaries;

create policy "Users can read own resource summaries."
  on public.resource_summaries for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.module_resources mr
      left join public.modules m on m.id = mr.module_id
      join public.courses c on c.id = coalesce(mr.course_id, m.course_id)
      where mr.id = resource_summaries.resource_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can insert own resource summaries."
  on public.resource_summaries for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.module_resources mr
      left join public.modules m on m.id = mr.module_id
      join public.courses c on c.id = coalesce(mr.course_id, m.course_id)
      where mr.id = resource_summaries.resource_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can update own resource summaries."
  on public.resource_summaries for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.module_resources mr
      left join public.modules m on m.id = mr.module_id
      join public.courses c on c.id = coalesce(mr.course_id, m.course_id)
      where mr.id = resource_summaries.resource_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.module_resources mr
      left join public.modules m on m.id = mr.module_id
      join public.courses c on c.id = coalesce(mr.course_id, m.course_id)
      where mr.id = resource_summaries.resource_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can delete own resource summaries."
  on public.resource_summaries for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.module_resources mr
      left join public.modules m on m.id = mr.module_id
      join public.courses c on c.id = coalesce(mr.course_id, m.course_id)
      where mr.id = resource_summaries.resource_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "Users can read own module summaries." on public.module_summaries;
drop policy if exists "Users can insert own module summaries." on public.module_summaries;
drop policy if exists "Users can update own module summaries." on public.module_summaries;
drop policy if exists "Users can delete own module summaries." on public.module_summaries;

create policy "Users can read own module summaries."
  on public.module_summaries for select
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_summaries.module_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can insert own module summaries."
  on public.module_summaries for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_summaries.module_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can update own module summaries."
  on public.module_summaries for update
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_summaries.module_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_summaries.module_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can delete own module summaries."
  on public.module_summaries for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.modules m
      join public.courses c on c.id = m.course_id
      where m.id = module_summaries.module_id
        and c.user_id = auth.uid()
    )
  );

notify pgrst, 'reload schema';
