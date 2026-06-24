-- 0011_gold_assets.sql — track physical gold holdings as an asset.
-- gold_holdings: the user's pieces (grams by karat). gold_prices: a server-side
-- cache of the live local Egyptian per-gram price (written by the gold-price
-- Edge Function, read by no one else). Net worth = cash accounts + gold value.

-- ---------------------------------------------------------------------------
-- gold_holdings : owner-only, like accounts
-- ---------------------------------------------------------------------------
create table public.gold_holdings (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  karat      smallint    not null check (karat in (24, 21, 18)),
  grams      numeric(10, 3) not null check (grams > 0),
  label      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index gold_holdings_user_idx on public.gold_holdings (user_id);

alter table public.gold_holdings enable row level security;

create policy "gold_holdings_select_own"
  on public.gold_holdings for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "gold_holdings_insert_own"
  on public.gold_holdings for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "gold_holdings_update_own"
  on public.gold_holdings for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "gold_holdings_delete_own"
  on public.gold_holdings for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- gold_prices : single-row server cache of the live local EGP/gram price.
-- Written only by the service role (gold-price Edge Function); RLS on + no
-- policies => no client access (the app reads price via the function).
-- ---------------------------------------------------------------------------
create table public.gold_prices (
  id         text        primary key default 'egypt',
  price_24   numeric(10, 2),   -- EGP per gram, 24k (selling price)
  price_21   numeric(10, 2),
  price_18   numeric(10, 2),
  source     text,
  fetched_at timestamptz not null default now()
);

alter table public.gold_prices enable row level security;
