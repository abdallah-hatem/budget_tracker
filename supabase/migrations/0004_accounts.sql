-- 0004_accounts.sql — Accounts & balances
-- accounts table (+RLS), transactions.account_id, default-account trigger,
-- set_default_account() RPC, account_balances view, backfill + new-user default.

-- ---------------------------------------------------------------------------
-- accounts : per-user money buckets
-- ---------------------------------------------------------------------------
create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null check (char_length(trim(name)) between 1 and 40),
  opening_balance numeric(14, 2) not null default 0,
  is_default      boolean not null default false,
  currency        text not null default 'EGP'
                    constraint accounts_currency_egp check (currency = 'EGP'),
  created_at      timestamptz not null default now()
);

create index accounts_user_idx on public.accounts (user_id);
-- At most one default account per user.
create unique index accounts_one_default_per_user
  on public.accounts (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- transactions.account_id : which account a txn debits/credits (nullable).
-- ON DELETE SET NULL -> deleting an account unassigns its txns (still counted
-- in global totals, just no account).
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column account_id uuid references public.accounts (id) on delete set null;
create index transactions_account_idx on public.transactions (account_id);

-- ---------------------------------------------------------------------------
-- RLS : owner-only (mirrors transactions policies)
-- ---------------------------------------------------------------------------
alter table public.accounts enable row level security;

create policy "accounts_select_own"
  on public.accounts for select to authenticated
  using ( (select auth.uid()) = user_id );
create policy "accounts_insert_own"
  on public.accounts for insert to authenticated
  with check ( (select auth.uid()) = user_id );
create policy "accounts_update_own"
  on public.accounts for update to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );
create policy "accounts_delete_own"
  on public.accounts for delete to authenticated
  using ( (select auth.uid()) = user_id );

-- ---------------------------------------------------------------------------
-- Trigger : fill account_id from the user's default when caller leaves it null.
-- security invoker so the SELECT runs under the inserting role; works for both
-- the authenticated client (RLS allows reading own accounts) and the service
-- role used by ingest-sms (bypasses RLS, matched on user_id).
-- ---------------------------------------------------------------------------
create or replace function public.set_transaction_default_account()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.account_id is null then
    select id into new.account_id
      from public.accounts
     where user_id = new.user_id and is_default
     limit 1;
  end if;
  return new;
end;
$$;

create trigger transactions_set_default_account
  before insert on public.transactions
  for each row execute function public.set_transaction_default_account();

-- ---------------------------------------------------------------------------
-- RPC : atomically move the default flag to `target` (partial unique index
-- forbids two defaults, so clear the old one first).
-- ---------------------------------------------------------------------------
create or replace function public.set_default_account(target uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.accounts set is_default = false
    where user_id = (select auth.uid()) and is_default and id <> target;
  update public.accounts set is_default = true
    where id = target and user_id = (select auth.uid());
end;
$$;

grant execute on function public.set_default_account(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- View : live per-account balance = opening + confirmed income − confirmed expense.
-- security_invoker so the underlying RLS (accounts + transactions) applies.
-- ---------------------------------------------------------------------------
create view public.account_balances
  with (security_invoker = on)
as
select
  a.id,
  a.user_id,
  a.name,
  a.opening_balance,
  a.is_default,
  a.currency,
  a.created_at,
  a.opening_balance + coalesce(sum(
    case when t.type = 'income' then t.amount else -t.amount end
  ) filter (where t.status = 'confirmed'), 0) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

grant select on public.account_balances to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill : default 'Main' account per existing user, then attach their txns.
-- ---------------------------------------------------------------------------
insert into public.accounts (user_id, name, opening_balance, is_default)
select u.id, 'Main', 0, true
from auth.users u
where not exists (select 1 from public.accounts a where a.user_id = u.id);

update public.transactions t
set account_id = a.id
from public.accounts a
where a.user_id = t.user_id and a.is_default and t.account_id is null;

-- ---------------------------------------------------------------------------
-- New users : create a default 'Main' account alongside the profile.
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
  insert into public.accounts (user_id, name, opening_balance, is_default)
  values (new.id, 'Main', 0, true);
  return new;
end;
$$;
