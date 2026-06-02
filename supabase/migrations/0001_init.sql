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

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------

-- profiles: owner-only, keyed on id ( = auth.uid() )
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using ( (select auth.uid()) = id );

create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check ( (select auth.uid()) = id );

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy "profiles_delete_own"
  on public.profiles for delete
  to authenticated
  using ( (select auth.uid()) = id );

-- transactions: owner-only, keyed on user_id
alter table public.transactions enable row level security;

create policy "transactions_select_own"
  on public.transactions for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "transactions_insert_own"
  on public.transactions for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "transactions_update_own"
  on public.transactions for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "transactions_delete_own"
  on public.transactions for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

-- categories: global read-only reference data.
-- RLS on with a permissive SELECT for anon + authenticated, and NO write policy
-- (so reads work for everyone, writes are denied to all client roles).
alter table public.categories enable row level security;

create policy "categories_select_all"
  on public.categories for select
  to anon, authenticated
  using ( true );

-- ---------------------------------------------------------------------------
-- Auto-create a profiles row when a new auth user is created.
-- SECURITY DEFINER so the supabase_auth_admin role can insert into public.profiles.
-- search_path = '' (hardening) -> everything is schema-qualified below.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    new.raw_user_meta_data ->> 'display_name',
    coalesce(new.raw_user_meta_data ->> 'locale', 'en')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
