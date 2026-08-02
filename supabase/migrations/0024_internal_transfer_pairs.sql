-- 0024_internal_transfer_pairs.sql
-- Keep mirrored bank notifications for a card payment out of cash-flow totals.
-- The pair is inferred server-side from the bank reference; users do not pick
-- source/destination accounts.

alter table public.transactions
  add column if not exists transfer_reference text,
  add column if not exists is_internal_transfer boolean not null default false;

comment on column public.transactions.transfer_reference is
  'Bank-provided reference used to pair mirrored Instapay debit/credit SMS rows.';
comment on column public.transactions.is_internal_transfer is
  'True when this row is one side of a matched internal card/account transfer.';

create index if not exists transactions_internal_transfer_idx
  on public.transactions (user_id, transfer_reference, type)
  where transfer_reference is not null and is_internal_transfer = false;

-- Account balances represent spendable cash, so matched internal transfers do
-- not change them. Keep the view shape unchanged for existing clients.
create or replace view public.account_balances
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
  ) filter (where t.status = 'confirmed' and not t.is_internal_transfer), 0) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;
