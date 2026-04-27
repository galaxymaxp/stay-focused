alter table public.modules
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.learning_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.task_items
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.tasks
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.deadlines
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.module_resources
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

drop policy if exists "Users can manage own modules" on public.modules;
create policy "Users can manage own modules"
on public.modules
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own learning_items" on public.learning_items;
create policy "Users can manage own learning_items"
on public.learning_items
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own task_items" on public.task_items;
create policy "Users can manage own task_items"
on public.task_items
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own tasks" on public.tasks;
create policy "Users can manage own tasks"
on public.tasks
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own deadlines" on public.deadlines;
create policy "Users can manage own deadlines"
on public.deadlines
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own module_resources" on public.module_resources;
create policy "Users can manage own module_resources"
on public.module_resources
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

notify pgrst, 'reload schema';