-- ---------------------------------------------------------------------------
-- 0017_budgets — spending caps + the alert dedup ledger.
--
-- budgets:       one row per (user, scope, category, period) cap.
-- budget_alerts: append-only ledger of what we have already notified about, so
--                the daily budget-check job never repeats an alert in a cycle.
-- ---------------------------------------------------------------------------

-- The custom "start of month" day was device-local (AsyncStorage). The daily
-- server job needs it to resolve each user's monthly cycle, so persist it.
alter table public.profiles
  add column if not exists month_start_day int not null default 1
    check (month_start_day between 1 and 28);

create table if not exists public.budgets (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  scope         text not null check (scope in ('overall', 'category')),
  category_slug text references public.categories (slug) on delete cascade,
  period        text not null check (period in ('monthly', 'weekly')),
  amount        numeric(12,2) not null check (amount > 0),
  warn_pct      int not null default 80 check (warn_pct between 1 and 99),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 'overall' has no category; 'category' must have one.
  constraint budgets_scope_category_ck
    check ((scope = 'overall') = (category_slug is null))
);

-- At most one monthly and one weekly cap per target. coalesce() keeps the
-- unique index usable for the overall rows (null category_slug).
create unique index if not exists budgets_unique_target_idx
  on public.budgets (user_id, scope, coalesce(category_slug, ''), period);

create index if not exists budgets_user_idx on public.budgets (user_id);

create table if not exists public.budget_alerts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  budget_id     uuid references public.budgets (id) on delete cascade,
  kind          text not null check (kind in (
                  'approaching', 'reached', 'exceeded', 'pace', 'recap',
                  'insight_spike', 'insight_frequency')),
  cycle_key     text not null,
  category_slug text,
  meta          jsonb not null default '{}'::jsonb,
  sent_at       timestamptz not null default now()
);

-- The dedup guarantee: one alert per (user, budget, kind, cycle, category).
create unique index if not exists budget_alerts_dedup_idx
  on public.budget_alerts (
    user_id, coalesce(budget_id::text, ''), kind, cycle_key,
    coalesce(category_slug, '')
  );

create index if not exists budget_alerts_user_sent_idx
  on public.budget_alerts (user_id, sent_at desc);

-- ---------------------------------------------------------------------------
-- RLS — every row is private to its owner.
-- ---------------------------------------------------------------------------
alter table public.budgets enable row level security;
alter table public.budget_alerts enable row level security;

create policy "budgets_select_own" on public.budgets for select
  to authenticated using ( (select auth.uid()) = user_id );

create policy "budgets_insert_own" on public.budgets for insert
  to authenticated with check ( (select auth.uid()) = user_id );

-- UPDATE needs both USING and WITH CHECK, else a user could reassign user_id.
create policy "budgets_update_own" on public.budgets for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "budgets_delete_own" on public.budgets for delete
  to authenticated using ( (select auth.uid()) = user_id );

-- Clients only ever READ their alert history; the service-role job writes it.
create policy "budget_alerts_select_own" on public.budget_alerts for select
  to authenticated using ( (select auth.uid()) = user_id );
