-- 0001_init.sql — Budget Tracker schema (Phase 1)
-- Tables: profiles, categories, transactions. + indexes, RLS, profile-on-signup trigger.
-- NOTE: ingest_tokens is Phase 2 and intentionally NOT created here.

-- ---------------------------------------------------------------------------
-- profiles : one row per auth user, keyed on auth.users.id
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  locale       text not null default 'en' check (locale in ('ar', 'en')),
  currency     text not null default 'EGP',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories : global, seeded, read-only to users. Bilingual labels.
-- ---------------------------------------------------------------------------
create table public.categories (
  slug       text primary key,
  name_en    text not null,
  name_ar    text not null,
  kind       text not null check (kind in ('expense', 'income')),
  icon       text not null,
  color      text not null,
  sort_order int  not null
);

-- ---------------------------------------------------------------------------
-- transactions : per-user core table
-- ---------------------------------------------------------------------------
create table public.transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  type          text not null check (type in ('expense', 'income')),
  amount        numeric(14, 2) not null check (amount > 0),
  currency      text not null default 'EGP',
  category_slug text not null references public.categories (slug),
  note          text,
  raw_text      text,
  source        text not null check (source in ('voice', 'text', 'sms')),
  status        text not null default 'confirmed' check (status in ('pending', 'confirmed')),
  confidence    numeric(3, 2),
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

-- Indexes tuned for the dashboard (per-user time window) and category filtering.
create index transactions_user_occurred_idx on public.transactions (user_id, occurred_at desc);
create index transactions_user_category_idx on public.transactions (user_id, category_slug);
