# Accounts & Balances — Design

**Date:** 2026-06-05
**Status:** Approved (design)
**Branch:** `feat/phase1-mvp`

## Problem

A user holds money in real-world accounts (e.g. a bank account with 100,000 EGP,
some cash). Today the app only tracks transaction *flow* (income/expense per
month) and has no concept of a *balance* — "how much do I actually have right
now". The user wants to:

1. Create named accounts (e.g. "Bank") with a custom starting balance.
2. Mark one account as the **default**.
3. Have every captured payment automatically debit/credit the default account,
   so each account shows a live running balance.

## Decisions (from brainstorming)

- **Account model:** Multiple accounts, one is default. New transactions
  (voice / text / SMS) auto-attach to the default. A transaction's account can
  be changed in the edit sheet. (Chosen over "always default, no override" and
  "single balance only".)
- **Placement:** Manage accounts in a new **Settings** section; show balances on
  the **dashboard** in an Accounts card. No new tab.
- **Transfers between accounts:** out of scope.
- **Multi-currency:** out of scope (EGP only; accounts still carry `currency`
  for forward-compat).
- **Default account starting name:** **"Main"**.
- **Deleting an account that has transactions:** the transactions are
  *unassigned* (`account_id` → null). They still count in global
  income/expense/net totals; they just belong to no account balance.

## Core architectural choice

Make the default-account behavior and balance math live in the **database**, not
in each client path:

- A **`BEFORE INSERT` trigger** on `transactions` sets `account_id` to the user's
  default account whenever the inserted row leaves it null. → The capture screen
  and the `ingest-sms` Edge Function need **no changes** to get the default
  behavior; any future insert path inherits it too.
- A **`account_balances` SQL view** computes each account's live balance, so the
  app never has to load all-time transactions to sum them.

Rejected alternative: every client (capture, ingest-sms, any future path) looks
up the default account and sets `account_id` itself, and balances are summed in
JS. More code in more places, easier to drift out of sync.

## Data model — migration `0004_accounts.sql`

### `accounts` table

```
id              uuid pk default gen_random_uuid()
user_id         uuid not null references auth.users(id) on delete cascade
name            text not null check (char_length(trim(name)) between 1 and 40)
opening_balance numeric(14,2) not null default 0     -- may be negative (e.g. credit card)
is_default      boolean not null default false
currency        text not null default 'EGP' check (currency = 'EGP')
created_at      timestamptz not null default now()
```

- **One default per user:** `create unique index accounts_one_default_per_user
  on public.accounts (user_id) where is_default;`
- **RLS:** owner-only select/insert/update/delete, keyed on `user_id`
  (mirrors the `transactions` policies).
- Index: `accounts_user_idx on (user_id)`.

### `transactions.account_id`

```
alter table public.transactions
  add column account_id uuid references public.accounts(id) on delete set null;
create index transactions_account_idx on public.transactions (account_id);
```

Nullable: a transaction with `account_id = null` is "unassigned" — it still
counts in global income/expense/net, just not in any account balance.

### Default-account trigger

```
create function public.set_transaction_default_account() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.account_id is null then
    select id into new.account_id
      from public.accounts
     where user_id = new.user_id and is_default
     limit 1;
  end if;
  return new;
end; $$;

create trigger transactions_set_default_account
  before insert on public.transactions
  for each row execute function public.set_transaction_default_account();
```

`security invoker` so the lookup runs under the inserting user and RLS still
applies (a user can only ever resolve to their own default account).

### `set_default_account(target uuid)` RPC

Atomically flips the default (needed because of the partial unique index):

```
create function public.set_default_account(target uuid) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  update public.accounts set is_default = false
    where user_id = auth.uid() and is_default and id <> target;
  update public.accounts set is_default = true
    where id = target and user_id = auth.uid();
end; $$;
```

### `account_balances` view

```
create view public.account_balances with (security_invoker = on) as
select a.id, a.user_id, a.name, a.opening_balance, a.is_default,
       a.currency, a.created_at,
       a.opening_balance + coalesce(sum(
         case when t.type = 'income' then t.amount else -t.amount end
       ) filter (where t.status = 'confirmed'), 0) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;
```

Only `status = 'confirmed'` rows move the balance — pending SMS transactions do
not affect it until confirmed (consistent with `summarize()`).

### Backfill + new-user default

- **Backfill (in the migration):** for every existing `auth.users` row that has
  no account, insert a default account `('Main', 0, is_default = true)`; then
  `update transactions set account_id = <that user's default>` where
  `account_id is null`.
- **New users:** extend `handle_new_user()` to also insert a default `'Main'`
  account for the new user (so a default always exists before any transaction).

## Types (`src/types/index.ts`)

```ts
export interface Account {
  id: string;
  user_id: string;
  name: string;
  opening_balance: number;
  is_default: boolean;
  currency: string;
  created_at: string;
}

// Row shape returned by the account_balances view.
export interface AccountBalance extends Account {
  balance: number;
}

export interface Transaction { /* ...existing... */ account_id: string | null; }
export type NewAccount = Pick<Account, 'name' | 'opening_balance' | 'is_default'>;
```

`NewTransaction` keeps `account_id` optional/absent — the trigger fills it.

## Client module — `src/features/accounts/`

- **`api.ts`**
  - `listAccountBalances(): Promise<AccountBalance[]>` — select from
    `account_balances`, ordered default-first then by `created_at`.
  - `createAccount({ name, opening_balance, is_default }): Promise<Account>` —
    **insert with `is_default = false`** (so it never collides with the existing
    default on the partial unique index), then, if the user chose "make
    default", call `set_default_account(newId)` to flip atomically. Returns the
    (possibly re-fetched) account.
  - `updateAccount(id, { name?, opening_balance? }): Promise<Account>`.
  - `setDefaultAccount(id): Promise<void>` — RPC wrapper.
  - `deleteAccount(id): Promise<void>` — guarded so a default account cannot be
    deleted (caller must set another default first).
- **`useAccountBalances.ts`** — hook returning `{ balances, total, loading,
  error, refresh }`; used by the dashboard card and the Settings section.

## UI

### Settings → "Accounts" section
- Lists each account: name, balance (via `Money`), a "Default" marker.
- Row actions: **Set default**, **Edit** (name + starting balance via a sheet,
  reusing the `EditTransactionSheet` styling conventions), **Delete**
  (hidden/disabled for the default account; confirm before deleting).
- **Add account** button → a small form/sheet: name, starting balance,
  "Make default" toggle.

### Dashboard → "Accounts" card
- A `Card` titled "Accounts" / "الحسابات" showing each account name + balance,
  and a **Total** across all accounts. Read-only (tapping is not required for
  v1). Independent of the month selector (balance is current, all-time).

### Edit-transaction sheet → account picker
- A horizontal chip row (same pattern as the category chips) listing the user's
  accounts; selecting one sets `account_id` on save via `updateTransaction`.

### Capture
- **Unchanged.** Stays one-tap; the DB trigger assigns the default account.

## i18n
New keys (en + ar): `settings.accounts`, `accounts.title`, `accounts.add`,
`accounts.name`, `accounts.starting_balance`, `accounts.make_default`,
`accounts.default`, `accounts.set_default`, `accounts.total`,
`accounts.delete_confirm`, `accounts.account` (edit-sheet picker label).

## Testing

- **Deno (DB):** trigger fills `account_id` from default on insert; leaves a
  provided `account_id` untouched; `set_default_account` enforces a single
  default; `account_balances` math (opening + confirmed income − confirmed
  expense; pending excluded); RLS denies cross-user access; deleting an account
  nulls its transactions' `account_id`.
- **Jest (pure/units):** `account_balances` total reducer (sum of balances);
  `createAccount`/`setDefaultAccount`/`deleteAccount` api request shapes
  (mocked supabase); delete-default guard; edit-sheet renders an account chip
  per account and reassigns on save; Settings Accounts section add/set-default
  flows; dashboard Accounts card renders balances + total.

## Out of scope (future)
Transfers between accounts; multi-currency; per-account spending charts;
archiving accounts; reordering accounts.
