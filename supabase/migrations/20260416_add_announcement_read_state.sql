create table if not exists public.announcement_read_state (
  announcement_key text not null,
  module_id uuid not null references public.modules(id) on delete cascade,
  support_id text not null,
  title text not null,
  posted_label text,
  href text not null,
  user_id uuid references auth.users(id) on delete cascade,
  user_key text not null,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_key, announcement_key)
);

create index if not exists announcement_read_state_user_id_idx
  on public.announcement_read_state(user_id, updated_at desc);

create index if not exists announcement_read_state_module_id_idx
  on public.announcement_read_state(module_id, updated_at desc);

grant all on table public.announcement_read_state to anon, authenticated, service_role;

alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;

alter table public.announcement_read_state disable row level security;
