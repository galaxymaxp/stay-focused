create table if not exists public.module_terms (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  resource_id uuid references public.module_resources(id) on delete set null,
  normalized_term text not null,
  term text not null,
  definition text,
  explanation text,
  evidence_snippet text,
  source_label text,
  status text not null default 'approved'
    check (status in ('approved', 'rejected')),
  origin text not null default 'ai'
    check (origin in ('ai', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists module_terms_module_id_idx
  on public.module_terms(module_id);

create index if not exists module_terms_module_status_idx
  on public.module_terms(module_id, status);

create unique index if not exists module_terms_module_normalized_term_uidx
  on public.module_terms(module_id, normalized_term);
