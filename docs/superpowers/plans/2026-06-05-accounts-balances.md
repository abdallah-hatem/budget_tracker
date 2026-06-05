# Accounts & Balances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create named accounts with a starting balance, mark one default, and have every transaction auto-debit/credit the default account so each account shows a live balance.

**Architecture:** Default-account assignment and balance math live in Postgres — a `BEFORE INSERT` trigger fills `transactions.account_id` from the user's default account, and an `account_balances` view sums confirmed transactions per account. The capture screen and `ingest-sms` function need no changes. The app gains an accounts API/hook, a Settings management section, a dashboard balances card, and an account picker in the edit sheet.

**Tech Stack:** Supabase (Postgres + RLS + plpgsql triggers/RPC/views), TypeScript, Expo/React Native, NativeWind, Jest, Deno, psql.

**Spec:** `docs/superpowers/specs/2026-06-05-accounts-balances-design.md`

**Conventions to keep green throughout:** `npx jest`, `npx tsc --noEmit`, and the psql DB checks. Local Supabase must be running (`supabase start`; if port conflict, stop `split_bite` first). Apply migrations with `supabase migration up` (NOT `db reset` — preserves data).

---

## File Structure

- Create: `supabase/migrations/0004_accounts.sql` — schema, RLS, trigger, RPC, view, backfill.
- Create: `supabase/tests/accounts_check.sql` — psql assertions (trigger/view/RPC/RLS/delete).
- Modify: `src/types/index.ts` — `Account`, `AccountBalance`, `NewAccount`, `Transaction.account_id`.
- Create: `src/features/accounts/balances.ts` — pure `totalBalance()` reducer.
- Create: `src/features/accounts/balances.test.ts` — its tests.
- Create: `src/features/accounts/api.ts` — supabase data access.
- Create: `src/features/accounts/__tests__/api.test.ts` — its tests.
- Create: `src/features/accounts/useAccountBalances.ts` — load hook.
- Modify: `src/lib/i18n.ts` — account/settings strings (en + ar).
- Modify: `app/(tabs)/index.tsx` — dashboard Accounts card.
- Modify: `app/(tabs)/__tests__/index.test.tsx` (or create if absent) — card test.
- Modify: `src/features/transactions/EditTransactionSheet.tsx` — account picker.
- Modify: `src/features/transactions/EditTransactionSheet.test.tsx` — picker test.
- Modify: `app/(tabs)/settings.tsx` — Accounts management section.
- Modify: `app/(tabs)/__tests__/settings.test.tsx` — section test.

---

## Task 1: DB migration — accounts, trigger, RPC, view, backfill

**Files:**
- Create: `supabase/migrations/0004_accounts.sql`
- Create: `supabase/tests/accounts_check.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0004_accounts.sql`:

```sql
-- 0004_accounts.sql — Accounts & balances
-- accounts table (+RLS), transactions.account_id, default-account trigger,
-- set_default_account() RPC, account_balances view, backfill + new-user default.

-- accounts : per-user money buckets
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

-- transactions.account_id : which account a txn debits/credits (nullable).
-- ON DELETE SET NULL -> deleting an account unassigns its txns.
alter table public.transactions
  add column account_id uuid references public.accounts (id) on delete set null;
create index transactions_account_idx on public.transactions (account_id);

-- RLS : owner-only (mirrors transactions policies)
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

-- Trigger : fill account_id from the user's default when caller leaves it null.
-- security invoker so the SELECT runs under the inserting role; works for both
-- the authenticated client (RLS allows reading own accounts) and the service
-- role used by ingest-sms (bypasses RLS, matched on user_id).
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

-- RPC : atomically move the default flag to `target`.
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

-- View : live per-account balance = opening + confirmed income − confirmed expense.
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

-- Backfill : default 'Main' account per existing user, then attach their txns.
insert into public.accounts (user_id, name, opening_balance, is_default)
select u.id, 'Main', 0, true
from auth.users u
where not exists (select 1 from public.accounts a where a.user_id = u.id);

update public.transactions t
set account_id = a.id
from public.accounts a
where a.user_id = t.user_id and a.is_default and t.account_id is null;

-- New users : create a default 'Main' account alongside the profile.
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
```

- [ ] **Step 2: Apply the migration**

Run: `supabase migration up`
Expected: applies `0004_accounts.sql` with no error.

- [ ] **Step 3: Write the psql behavior test**

Create `supabase/tests/accounts_check.sql` (transaction + rollback, like `rls_check.sql`):

```sql
-- supabase/tests/accounts_check.sql
-- Proves: default-account trigger, account_balances math (confirmed only),
-- set_default_account single-default invariant, delete -> account_id null,
-- and accounts RLS isolation. Wrapped in a txn + rollback (no residue).
-- Run: docker exec supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 \
--        -f /work/supabase/tests/accounts_check.sql
begin;

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'acct-a@test.dev');
-- handle_new_user already created a default 'Main' account for this user.

do $$
declare def_id uuid; n int;
begin
  select id into def_id from public.accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1' and is_default;
  assert def_id is not null, 'FAIL: new user has no default account';

  -- Trigger fills account_id from the default when null.
  insert into public.transactions (user_id, type, amount, category_slug, source, status)
  values ('00000000-0000-0000-0000-0000000000a1', 'expense', 100.00, 'food', 'text', 'confirmed');
  select count(*) into n from public.transactions
    where user_id = '00000000-0000-0000-0000-0000000000a1' and account_id = def_id;
  assert n = 1, 'FAIL: trigger did not assign default account_id';
  raise notice 'PASS: trigger assigns default account';

  -- Balance view: opening(0) + income(500) - expense(100) = 400 (pending excluded).
  insert into public.transactions (user_id, type, amount, category_slug, source, status, account_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'income', 500.00, 'salary', 'text', 'confirmed', def_id),
         ('00000000-0000-0000-0000-0000000000a1', 'expense', 999.00, 'food', 'sms', 'pending', def_id);
  perform 1;
  declare bal numeric; begin
    select balance into bal from public.account_balances where id = def_id;
    assert bal = 400.00, format('FAIL: balance %s expected 400.00', bal);
  end;
  raise notice 'PASS: balance excludes pending, sums confirmed';

  -- A provided account_id is preserved (trigger only fills when null).
  insert into public.accounts (id, user_id, name, opening_balance, is_default)
  values ('00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000a1', 'Cash', 0, false);
  insert into public.transactions (user_id, type, amount, category_slug, source, status, account_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'expense', 10.00, 'food', 'text', 'confirmed',
          '00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from public.transactions
    where account_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 1, 'FAIL: explicit account_id overwritten by trigger';
  raise notice 'PASS: explicit account_id preserved';

  -- set_default_account moves the single default flag.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  perform public.set_default_account('00000000-0000-0000-0000-0000000000c1');
  reset role;
  select count(*) into n from public.accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1' and is_default;
  assert n = 1, format('FAIL: %s default accounts after flip (expected 1)', n);
  perform 1 from public.accounts
    where id = '00000000-0000-0000-0000-0000000000c1' and is_default;
  assert found, 'FAIL: target account is not default after flip';
  raise notice 'PASS: set_default_account keeps exactly one default';

  -- Deleting an account nulls its transactions account_id (SET NULL).
  delete from public.accounts where id = '00000000-0000-0000-0000-0000000000c1';
  select count(*) into n from public.transactions
    where account_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 0, 'FAIL: deleted account left dangling account_id';
  raise notice 'PASS: delete account -> txn account_id null';
end $$;

-- RLS isolation: user B cannot see user A's accounts.
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'acct-b@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare visible int;
begin
  select count(*) into visible from public.accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1';
  assert visible = 0, format('FAIL: user B sees %s of user A accounts', visible);
  raise notice 'PASS: accounts RLS isolates users';
end $$;
reset role;

rollback;
```

- [ ] **Step 4: Run the psql test**

Run:
```bash
docker cp supabase/tests/accounts_check.sql supabase_db_budget_tracker:/tmp/accounts_check.sql
docker exec supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/accounts_check.sql
```
Expected: five `PASS:` notices, ends with `ROLLBACK`, no `FAIL`/error.

- [ ] **Step 5: Run the existing RLS test (no regression)**

Run:
```bash
docker cp supabase/tests/rls_check.sql supabase_db_budget_tracker:/tmp/rls_check.sql
docker exec supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/rls_check.sql
```
Expected: existing PASS notices, no FAIL (the new `account_id` column + trigger don't break transaction inserts).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0004_accounts.sql supabase/tests/accounts_check.sql
git commit -m "feat(db): accounts table + default-account trigger + balances view (migration 0004)"
```

---

## Task 2: Domain types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add account types and `account_id`**

In `src/types/index.ts`, add `account_id: string | null;` to `Transaction` (after `confidence`), and append:

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

export type NewAccount = Pick<Account, 'name' | 'opening_balance' | 'is_default'>;
```

`NewTransaction` stays `Omit<Transaction, 'id' | 'created_at'>` — `account_id` becomes part of it but is optional in practice (the trigger fills it); callers omit it. To keep `buildCaptureRow` valid without setting it, make `account_id` optional on the insert type instead: change `NewTransaction` to `Omit<Transaction, 'id' | 'created_at' | 'account_id'> & { account_id?: string | null }`.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers break — `buildCaptureRow` omits `account_id`, which is now optional).

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): Account, AccountBalance, NewAccount + Transaction.account_id"
```

---

## Task 3: Pure balance total reducer (TDD)

**Files:**
- Create: `src/features/accounts/balances.ts`
- Create: `src/features/accounts/balances.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/balances.test.ts`:

```ts
import { totalBalance } from './balances';
import type { AccountBalance } from '../../types';

const acct = (over: Partial<AccountBalance>): AccountBalance => ({
  id: 'a', user_id: 'u', name: 'Main', opening_balance: 0,
  is_default: true, currency: 'EGP', created_at: '', balance: 0, ...over,
});

describe('totalBalance', () => {
  it('returns 0 for no accounts', () => {
    expect(totalBalance([])).toBe(0);
  });
  it('sums balances across accounts', () => {
    expect(totalBalance([acct({ balance: 100000 }), acct({ balance: -250.5 })])).toBe(99749.5);
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx jest src/features/accounts/balances.test.ts`
Expected: FAIL ("Cannot find module './balances'").

- [ ] **Step 3: Implement**

Create `src/features/accounts/balances.ts`:

```ts
import type { AccountBalance } from '../../types';

/** Sum of every account's live balance (the user's total net worth in-app). */
export function totalBalance(accounts: AccountBalance[]): number {
  return accounts.reduce((sum, a) => sum + a.balance, 0);
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx jest src/features/accounts/balances.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/balances.ts src/features/accounts/balances.test.ts
git commit -m "feat(accounts): totalBalance reducer"
```

---

## Task 4: Accounts API (TDD)

**Files:**
- Create: `src/features/accounts/api.ts`
- Create: `src/features/accounts/__tests__/api.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/__tests__/api.test.ts` (mirrors `src/features/ingest/__tests__/api.test.ts`):

```ts
import {
  listAccountBalances, createAccount, updateAccount,
  setDefaultAccount, deleteAccount,
} from '../api';
import { supabase } from '../../../lib/supabase';

jest.mock('../../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), from: jest.fn(), auth: { getUser: jest.fn() } },
}));
const mockRpc = supabase.rpc as jest.MockedFunction<typeof supabase.rpc>;
const mockFrom = supabase.from as unknown as jest.Mock;
const mockGetUser = supabase.auth.getUser as jest.Mock;

afterEach(() => jest.clearAllMocks());

describe('listAccountBalances', () => {
  it('selects from account_balances ordered default-first', async () => {
    const order2 = jest.fn().mockResolvedValue({ data: [{ id: 'a' }], error: null });
    const order1 = jest.fn().mockReturnValue({ order: order2 });
    const select = jest.fn().mockReturnValue({ order: order1 });
    mockFrom.mockReturnValue({ select });

    const res = await listAccountBalances();

    expect(mockFrom).toHaveBeenCalledWith('account_balances');
    expect(order1).toHaveBeenCalledWith('is_default', { ascending: false });
    expect(order2).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(res).toEqual([{ id: 'a' }]);
  });
});

describe('createAccount', () => {
  it('inserts is_default false and does NOT flip when make-default is off', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'new' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ insert });

    const res = await createAccount({ name: 'Bank', opening_balance: 100000, is_default: false });

    expect(insert).toHaveBeenCalledWith({
      user_id: 'u1', name: 'Bank', opening_balance: 100000, is_default: false,
    });
    expect(mockRpc).not.toHaveBeenCalled();
    expect(res).toEqual({ id: 'new' });
  });

  it('flips default via RPC when make-default is on', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'new' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockFrom.mockReturnValue({ insert });
    mockRpc.mockResolvedValue({ data: null, error: null } as any);

    await createAccount({ name: 'Bank', opening_balance: 0, is_default: true });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ is_default: false }));
    expect(mockRpc).toHaveBeenCalledWith('set_default_account', { target: 'new' });
  });
});

describe('setDefaultAccount', () => {
  it('calls the set_default_account RPC with target', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null } as any);
    await setDefaultAccount('acc-9');
    expect(mockRpc).toHaveBeenCalledWith('set_default_account', { target: 'acc-9' });
  });
});

describe('updateAccount', () => {
  it('updates the row by id and returns it', async () => {
    const single = jest.fn().mockResolvedValue({ data: { id: 'a', name: 'New' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const eq = jest.fn().mockReturnValue({ select });
    const update = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ update });

    const res = await updateAccount('a', { name: 'New' });

    expect(update).toHaveBeenCalledWith({ name: 'New' });
    expect(eq).toHaveBeenCalledWith('id', 'a');
    expect(res).toEqual({ id: 'a', name: 'New' });
  });
});

describe('deleteAccount', () => {
  it('deletes by id', async () => {
    const eq = jest.fn().mockResolvedValue({ error: null });
    const del = jest.fn().mockReturnValue({ eq });
    mockFrom.mockReturnValue({ delete: del });

    await deleteAccount('a');

    expect(mockFrom).toHaveBeenCalledWith('accounts');
    expect(eq).toHaveBeenCalledWith('id', 'a');
  });
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx jest src/features/accounts/__tests__/api.test.ts`
Expected: FAIL ("Cannot find module '../api'").

- [ ] **Step 3: Implement**

Create `src/features/accounts/api.ts`:

```ts
import { supabase } from '../../lib/supabase';
import type { Account, AccountBalance, NewAccount } from '../../types';

/** All of the current user's accounts with live balances, default first. */
export async function listAccountBalances(): Promise<AccountBalance[]> {
  const { data, error } = await supabase
    .from('account_balances')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AccountBalance[];
}

/**
 * Create an account. Always inserts is_default=false (so it never collides with
 * the existing default on the partial unique index); if `is_default` was
 * requested, flips it via the atomic RPC afterwards.
 */
export async function createAccount(input: NewAccount): Promise<Account> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('accounts')
    .insert({
      user_id: userId,
      name: input.name,
      opening_balance: input.opening_balance,
      is_default: false,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const account = data as Account;
  if (input.is_default) {
    await setDefaultAccount(account.id);
  }
  return account;
}

export async function updateAccount(
  id: string,
  patch: Partial<Pick<Account, 'name' | 'opening_balance'>>,
): Promise<Account> {
  const { data, error } = await supabase
    .from('accounts')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Account;
}

export async function setDefaultAccount(id: string): Promise<void> {
  const { error } = await supabase.rpc('set_default_account', { target: id });
  if (error) throw new Error(error.message);
}

export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('accounts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx jest src/features/accounts/__tests__/api.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/api.ts src/features/accounts/__tests__/api.test.ts
git commit -m "feat(accounts): data-access api (list balances, create/update/delete, set default)"
```

---

## Task 5: useAccountBalances hook

**Files:**
- Create: `src/features/accounts/useAccountBalances.ts`

- [ ] **Step 1: Implement (pattern mirrors useTransactions)**

Create `src/features/accounts/useAccountBalances.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { listAccountBalances } from './api';
import { totalBalance } from './balances';
import type { AccountBalance } from '../../types';

export interface UseAccountBalancesResult {
  accounts: AccountBalance[];
  total: number;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/** Loads the user's accounts + balances; exposes the in-app total. */
export function useAccountBalances(): UseAccountBalancesResult {
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listAccountBalances();
      if (myReq !== reqIdRef.current) return;
      setAccounts(rows);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return { accounts, total: totalBalance(accounts), loading, error, refresh };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/accounts/useAccountBalances.ts
git commit -m "feat(accounts): useAccountBalances hook"
```

---

## Task 6: i18n strings

**Files:**
- Modify: `src/lib/i18n.ts`

- [ ] **Step 1: Add account strings**

In `src/lib/i18n.ts`, add inside `STRINGS` (after the Settings block):

```ts
  // ── Accounts ──────────────────────────────────────────────────────────────
  'settings.accounts': { en: 'Accounts', ar: 'الحسابات' },
  'accounts.title': { en: 'Accounts', ar: 'الحسابات' },
  'accounts.total': { en: 'Total', ar: 'الإجمالي' },
  'accounts.add': { en: 'Add account', ar: 'إضافة حساب' },
  'accounts.name': { en: 'Name', ar: 'الاسم' },
  'accounts.starting_balance': { en: 'Starting balance', ar: 'الرصيد الابتدائي' },
  'accounts.make_default': { en: 'Make default', ar: 'تعيين كافتراضي' },
  'accounts.default': { en: 'Default', ar: 'افتراضي' },
  'accounts.set_default': { en: 'Set default', ar: 'تعيين افتراضي' },
  'accounts.edit': { en: 'Edit', ar: 'تعديل' },
  'accounts.delete': { en: 'Delete', ar: 'حذف' },
  'accounts.delete_confirm': {
    en: 'Delete this account? Its transactions stay in your totals but become unassigned.',
    ar: 'حذف هذا الحساب؟ ستبقى معاملاته ضمن إجماليّاتك لكن بدون حساب.',
  },
  'accounts.save': { en: 'Save', ar: 'حفظ' },
  'accounts.cancel': { en: 'Cancel', ar: 'إلغاء' },
  'accounts.account': { en: 'Account', ar: 'الحساب' },
  'accounts.none': { en: 'No account', ar: 'بدون حساب' },
```

- [ ] **Step 2: Type-check + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add src/lib/i18n.ts
git commit -m "feat(i18n): account/balances strings (en + ar)"
```

---

## Task 7: Dashboard Accounts card (TDD)

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify/Create: `app/(tabs)/__tests__/index.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `app/(tabs)/__tests__/index.test.tsx` (create the file if missing, mirroring the other screen tests' render+mock setup; mock `useAccountBalances` to return two accounts):

```tsx
import { render } from '@testing-library/react-native';
import Dashboard from '../index';

jest.mock('@/src/features/accounts/useAccountBalances', () => ({
  useAccountBalances: () => ({
    accounts: [
      { id: 'a', user_id: 'u', name: 'Main', opening_balance: 0, is_default: true, currency: 'EGP', created_at: '', balance: 100000 },
      { id: 'b', user_id: 'u', name: 'Cash', opening_balance: 0, is_default: false, currency: 'EGP', created_at: '', balance: 250 },
    ],
    total: 100250, loading: false, error: null, refresh: jest.fn(),
  }),
}));
// (Keep the existing dashboard mocks for useMonthSummary, session, etc.)

it('renders the accounts card with each balance and a total', () => {
  const { getByTestId } = render(<Dashboard />);
  expect(getByTestId('account-card-a')).toBeTruthy();
  expect(getByTestId('account-card-b')).toBeTruthy();
  expect(getByTestId('accounts-total')).toBeTruthy();
});
```

> If `app/(tabs)/__tests__/index.test.tsx` does not exist, copy the mock/imports header from `app/(tabs)/__tests__/transactions.test.tsx` so the dashboard renders (session/profile, supabase, expo-router mocks) before adding this test.

- [ ] **Step 2: Run it (fails)**

Run: `npx jest app/(tabs)/__tests__/index.test.tsx`
Expected: FAIL (no `account-card-*` testIDs yet).

- [ ] **Step 3: Implement the card**

In `app/(tabs)/index.tsx`:
1. Add imports:
```tsx
import { useAccountBalances } from '../../src/features/accounts/useAccountBalances';
import { Money } from '../../src/ui/Money'; // already imported
```
2. Inside `Dashboard()`, after `useMonthSummary()`:
```tsx
  const { accounts, total, refresh: refreshAccounts } = useAccountBalances();
```
   and in the existing `useFocusEffect`, also call `void refreshAccounts();`.
3. Add the card as a new `Reveal` block (place it right after the Hero / before the donut). Use the existing `Card`, `SectionLabel`, `Money`, `AppText` primitives:
```tsx
        {accounts.length > 0 && (
          <Reveal index={revealIndex++}>
            <Card style={{ marginBottom: 16 }}>
              <SectionLabel>{t('accounts.title', locale)}</SectionLabel>
              <View style={{ marginTop: 12, gap: 10 }}>
                {accounts.map((a) => (
                  <View
                    key={a.id}
                    testID={`account-card-${a.id}`}
                    style={{
                      flexDirection: rtl ? 'row-reverse' : 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Text style={{ fontFamily: uiFontSemiBold(locale), fontSize: 15, color: '#F4F7F5' }}>
                      {a.name}
                      {a.is_default ? '  •' : ''}
                    </Text>
                    <Money amount={a.balance} tone="ink" sign="auto" size={16} />
                  </View>
                ))}
                <View
                  style={{
                    flexDirection: rtl ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTopWidth: 1,
                    borderTopColor: '#1C2322',
                    paddingTop: 10,
                    marginTop: 2,
                  }}
                >
                  <Text style={{ fontFamily: uiFontSemiBold(locale), fontSize: 13, color: '#6B7672', textTransform: 'uppercase', letterSpacing: 1 }}>
                    {t('accounts.total', locale)}
                  </Text>
                  <Money testID="accounts-total" amount={total} tone="accent" sign="auto" size={18} />
                </View>
              </View>
            </Card>
          </Reveal>
        )}
```

> Note: `Money` must forward `testID`. If it does not already, add `testID?: string` to `MoneyProps` and pass it to the `<Text>` (small change in `src/ui/Money.tsx`). Verify first; only edit if missing.

- [ ] **Step 4: Run it (passes)**

Run: `npx jest app/(tabs)/__tests__/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/index.tsx app/(tabs)/__tests__/index.test.tsx src/ui/Money.tsx
git commit -m "feat(ui): dashboard Accounts card with per-account balance + total"
```

---

## Task 8: Edit-sheet account picker (TDD)

**Files:**
- Modify: `src/features/transactions/EditTransactionSheet.tsx`
- Modify: `src/features/transactions/EditTransactionSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

In `EditTransactionSheet.test.tsx`, mock the accounts API and assert a chip per account renders and selecting one is reflected on save. Add:

```tsx
jest.mock('@/src/features/accounts/api', () => ({
  listAccountBalances: jest.fn().mockResolvedValue([
    { id: 'a', name: 'Main', is_default: true, balance: 0, user_id: 'u', opening_balance: 0, currency: 'EGP', created_at: '' },
    { id: 'b', name: 'Bank', is_default: false, balance: 100000, user_id: 'u', opening_balance: 100000, currency: 'EGP', created_at: '' },
  ]),
}));
jest.mock('./api', () => ({
  updateTransaction: jest.fn().mockResolvedValue({}),
  deleteTransaction: jest.fn().mockResolvedValue(undefined),
}));

it('shows an account chip per account and saves the chosen account_id', async () => {
  const onDone = jest.fn();
  const { getByTestId, findByTestId } = render(
    <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />,
  );
  fireEvent.press(await findByTestId('edit-account-b'));
  fireEvent.press(getByTestId('edit-save'));
  await waitFor(() => {
    expect(require('./api').updateTransaction).toHaveBeenCalledWith(
      txn.id, expect.objectContaining({ account_id: 'b' }),
    );
  });
});
```

(`txn` is the existing test fixture transaction; reuse it. Keep existing imports: `render`, `fireEvent`, `waitFor`, `findByTestId`.)

- [ ] **Step 2: Run it (fails)**

Run: `npx jest src/features/transactions/EditTransactionSheet.test.tsx`
Expected: FAIL (no `edit-account-*` testIDs; account_id not in patch).

- [ ] **Step 3: Implement the picker**

In `EditTransactionSheet.tsx`:
1. Imports: `import { useEffect } from 'react';` (already has useRef/useState), and
   `import { listAccountBalances } from '../accounts/api';`
   `import type { AccountBalance } from '../../types';`
2. State + load:
```tsx
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [accountId, setAccountId] = useState<string | null>(transaction.account_id);
  useEffect(() => {
    listAccountBalances().then(setAccounts).catch(() => {});
  }, []);
```
3. Include `account_id: accountId` in the `updateTransaction` patch inside `handleSave()`:
```tsx
      await updateTransaction(transaction.id, {
        type,
        amount: parsed,
        category_slug: categorySlug,
        note: note.trim() === '' ? null : note.trim(),
        account_id: accountId,
        ...(confirmOnSave ? { status: 'confirmed' as const } : {}),
      });
```
4. Render a chip row (mirror the category-chips block already in this file) above the action buttons. Each chip is a `PressableScale` (already imported) with `testID={\`edit-account-${a.id}\`}` setting `accountId`:
```tsx
      {accounts.length > 0 && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: FONT.jakartaMd, fontSize: 12, color: '#6B7672', letterSpacing: 0.8, textTransform: 'uppercase', textAlign: rtl ? 'right' : 'left' }}>
            {t('accounts.account', locale)}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 4 }}>
            {accounts.map((a) => {
              const on = accountId === a.id;
              return (
                <PressableScale
                  key={a.id}
                  testID={`edit-account-${a.id}`}
                  onPress={() => setAccountId(a.id)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
                    backgroundColor: on ? 'rgba(43,217,142,0.16)' : '#14191A',
                    borderWidth: on ? 1 : 0, borderColor: on ? 'rgba(43,217,142,0.4)' : 'transparent',
                  }}
                >
                  <Text style={{ fontFamily: FONT.jakartaSb, fontSize: 13, color: on ? '#2BD98E' : '#A8B2AF' }}>
                    {a.name}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>
      )}
```

- [ ] **Step 4: Run it (passes)**

Run: `npx jest src/features/transactions/EditTransactionSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/EditTransactionSheet.tsx src/features/transactions/EditTransactionSheet.test.tsx
git commit -m "feat(ui): account picker in the edit-transaction sheet"
```

---

## Task 9: Settings Accounts section (TDD)

**Files:**
- Modify: `app/(tabs)/settings.tsx`
- Modify: `app/(tabs)/__tests__/settings.test.tsx`

- [ ] **Step 1: Write the failing test**

In `app/(tabs)/__tests__/settings.test.tsx`, mock the accounts api/hook and assert the section lists accounts, can set a default, and can add one. Add:

```tsx
const setDefault = jest.fn().mockResolvedValue(undefined);
const create = jest.fn().mockResolvedValue({ id: 'new' });
jest.mock('@/src/features/accounts/api', () => ({
  listAccountBalances: jest.fn().mockResolvedValue([
    { id: 'a', name: 'Main', is_default: true, balance: 100000, user_id: 'u', opening_balance: 100000, currency: 'EGP', created_at: '' },
  ]),
  createAccount: (...args: unknown[]) => create(...args),
  setDefaultAccount: (id: string) => setDefault(id),
  updateAccount: jest.fn().mockResolvedValue({}),
  deleteAccount: jest.fn().mockResolvedValue(undefined),
}));

it('lists accounts and creates a new one', async () => {
  const { getByTestId, findByTestId } = render(<Settings />);
  expect(await findByTestId('account-row-a')).toBeTruthy();
  fireEvent.press(getByTestId('accounts-add'));
  fireEvent.changeText(getByTestId('account-name-input'), 'Bank');
  fireEvent.changeText(getByTestId('account-balance-input'), '100000');
  fireEvent.press(getByTestId('account-create-submit'));
  await waitFor(() => expect(create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Bank', opening_balance: 100000 }),
  ));
});
```

- [ ] **Step 2: Run it (fails)**

Run: `npx jest app/(tabs)/__tests__/settings.test.tsx`
Expected: FAIL (no Accounts section yet).

- [ ] **Step 3: Implement the section**

In `app/(tabs)/settings.tsx`, add a `Card` titled `t('settings.accounts', locale)` placed above the LANGUAGE card. It:
- loads via `listAccountBalances()` into local state on mount (and a `reload()` after mutations);
- renders one `account-row-${id}` per account: name, `Money` balance, a `accounts.default` marker or a `Set default` button (`account-setdefault-${id}` → `setDefaultAccount(id)` then reload), an Edit affordance (opens an inline form with `account-name-input`/`account-balance-input` prefilled → `updateAccount`), and a Delete button shown only when `!is_default` (`account-delete-${id}` → confirm via `Alert.alert` using `accounts.delete_confirm` → `deleteAccount(id)` then reload);
- an **Add** button `accounts-add` toggles an inline create form with `account-name-input`, `account-balance-input` (numeric), a `accounts.make_default` toggle, and `account-create-submit` → `createAccount({ name, opening_balance: parseFloat(balance) || 0, is_default })` then reload + close form.

Use the existing styling primitives in this file (`Card`, `SectionLabel`, `AppText`, `Pill`, `TouchableOpacity`, `Money` — import `Money` from `@/src/ui`). Parse the balance with `parseFloat`; guard empty name (disable submit). Keep all new interactive elements as `TouchableOpacity` (matches this file) or `PressableScale`.

Full code block for the section (insert after the ACCOUNT email card, before LANGUAGE):

```tsx
      {/* ── ACCOUNTS ───────────────────────────────────────────────────────── */}
      <Card className="mb-4">
        <SectionLabel>{t('settings.accounts', locale)}</SectionLabel>
        <View style={{ marginTop: 12, gap: 12 }}>
          {accounts.map((a) => (
            <View key={a.id} testID={`account-row-${a.id}`} style={{ gap: 8 }}>
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                  <AppText weight="semibold" className="text-ink" style={{ fontSize: 15 }}>{a.name}</AppText>
                  {a.is_default ? (
                    <View style={{ backgroundColor: 'rgba(43,217,142,0.16)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                      <AppText weight="semibold" className="text-accent" style={{ fontSize: 10 }}>{t('accounts.default', locale)}</AppText>
                    </View>
                  ) : null}
                </View>
                <Money amount={a.balance} tone="ink" sign="auto" size={15} />
              </View>
              <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 8 }}>
                {!a.is_default ? (
                  <TouchableOpacity testID={`account-setdefault-${a.id}`} onPress={() => onSetDefault(a.id)}>
                    <AppText className="text-accent" style={{ fontSize: 12 }}>{t('accounts.set_default', locale)}</AppText>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity testID={`account-edit-${a.id}`} onPress={() => openEdit(a)}>
                  <AppText className="text-ink2" style={{ fontSize: 12 }}>{t('accounts.edit', locale)}</AppText>
                </TouchableOpacity>
                {!a.is_default ? (
                  <TouchableOpacity testID={`account-delete-${a.id}`} onPress={() => onDelete(a.id)}>
                    <AppText className="text-danger" style={{ fontSize: 12 }}>{t('accounts.delete', locale)}</AppText>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </View>

        {/* Inline create/edit form */}
        {formOpen ? (
          <View style={{ marginTop: 14, gap: 10 }}>
            <TextInput
              testID="account-name-input"
              value={formName}
              onChangeText={setFormName}
              placeholder={t('accounts.name', locale)}
              placeholderTextColor="#6B7672"
              style={{ backgroundColor: '#1C2322', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#F4F7F5', fontFamily: FONT.jakartaMd, fontSize: 15, textAlign: rtl ? 'right' : 'left' }}
            />
            <TextInput
              testID="account-balance-input"
              value={formBalance}
              onChangeText={setFormBalance}
              keyboardType="numeric"
              placeholder={t('accounts.starting_balance', locale)}
              placeholderTextColor="#6B7672"
              style={{ backgroundColor: '#1C2322', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#F4F7F5', fontFamily: FONT.soraSb, fontSize: 15, textAlign: rtl ? 'right' : 'left' }}
            />
            {editId === null ? (
              <TouchableOpacity testID="account-makedefault-toggle" onPress={() => setFormDefault((d) => !d)} style={{ flexDirection: rtl ? 'row-reverse' : 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1, borderColor: '#2BD98E', backgroundColor: formDefault ? '#2BD98E' : 'transparent' }} />
                <AppText className="text-ink2" style={{ fontSize: 13 }}>{t('accounts.make_default', locale)}</AppText>
              </TouchableOpacity>
            ) : null}
            <View style={{ flexDirection: rtl ? 'row-reverse' : 'row', gap: 10 }}>
              <TouchableOpacity testID="account-create-submit" disabled={busy || formName.trim() === ''} onPress={onSubmitForm} style={{ flex: 1, backgroundColor: '#2BD98E', borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: formName.trim() === '' ? 0.5 : 1 }}>
                <AppText weight="semibold" style={{ fontSize: 14, color: '#06251A' }}>{t('accounts.save', locale)}</AppText>
              </TouchableOpacity>
              <TouchableOpacity testID="account-form-cancel" onPress={closeForm} style={{ flex: 1, backgroundColor: '#14191A', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
                <AppText weight="semibold" className="text-ink2" style={{ fontSize: 14 }}>{t('accounts.cancel', locale)}</AppText>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity testID="accounts-add" onPress={openCreate} style={{ marginTop: 14, backgroundColor: 'rgba(43,217,142,0.12)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}>
            <AppText weight="semibold" className="text-accent" style={{ fontSize: 14 }}>{t('accounts.add', locale)}</AppText>
          </TouchableOpacity>
        )}
      </Card>
```

Supporting state + handlers near the other settings state:

```tsx
  const [accounts, setAccounts] = useState<AccountBalance[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formBalance, setFormBalance] = useState('');
  const [formDefault, setFormDefault] = useState(false);

  const reloadAccounts = useCallback(() => {
    listAccountBalances().then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => { reloadAccounts(); }, [reloadAccounts]);

  function openCreate() {
    setEditId(null); setFormName(''); setFormBalance(''); setFormDefault(false); setFormOpen(true);
  }
  function openEdit(a: AccountBalance) {
    setEditId(a.id); setFormName(a.name); setFormBalance(String(a.opening_balance)); setFormOpen(true);
  }
  function closeForm() { setFormOpen(false); setEditId(null); }

  async function onSubmitForm() {
    if (formName.trim() === '') return;
    setBusy(true);
    try {
      const opening = parseFloat(formBalance) || 0;
      if (editId) {
        await updateAccount(editId, { name: formName.trim(), opening_balance: opening });
      } else {
        await createAccount({ name: formName.trim(), opening_balance: opening, is_default: formDefault });
      }
      closeForm();
      reloadAccounts();
    } finally { setBusy(false); }
  }
  async function onSetDefault(id: string) { await setDefaultAccount(id); reloadAccounts(); }
  function onDelete(id: string) {
    Alert.alert(t('accounts.delete', locale), t('accounts.delete_confirm', locale), [
      { text: t('accounts.cancel', locale), style: 'cancel' },
      { text: t('accounts.delete', locale), style: 'destructive', onPress: async () => { await deleteAccount(id); reloadAccounts(); } },
    ]);
  }
```

Imports to add: `useCallback`, `TextInput`, `Alert` from react-native; `Money` from `@/src/ui`; `FONT` from `@/src/lib/font`; the accounts api functions; `AccountBalance` type.

- [ ] **Step 4: Run it (passes)**

Run: `npx jest app/(tabs)/__tests__/settings.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(tabs)/settings.tsx app/(tabs)/__tests__/settings.test.tsx
git commit -m "feat(ui): Settings Accounts section (add / edit / set-default / delete)"
```

---

## Task 10: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Whole jest suite**

Run: `npx jest`
Expected: all suites PASS (prior 194 + new account tests).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Edge-function tests (no regression)**

Run: `cd supabase/functions && deno test --allow-all`
Expected: all PASS (ingest-sms untouched; trigger handles default server-side).

- [ ] **Step 4: DB checks**

Run both psql checks from Task 1 Steps 4–5; expect all PASS, no FAIL.

- [ ] **Step 5: Lint**

Run: `npx expo lint`
Expected: 0 errors.

- [ ] **Step 6: Final commit (if any cleanup)**

```bash
git add -A
git commit -m "test: accounts feature green across jest/tsc/deno/psql" --allow-empty
```

---

## Self-Review notes

- **Spec coverage:** accounts table + RLS (T1), account_id + ON DELETE SET NULL (T1), default trigger (T1), set_default_account RPC (T1), account_balances view confirmed-only (T1), backfill 'Main' + new-user default (T1), types (T2), api incl. insert-then-flip (T4), hook (T5), i18n (T6), dashboard card (T7), edit-sheet picker (T8), Settings section incl. delete-guard for default (T9). Capture intentionally unchanged.
- **Out of scope** (per spec): transfers, multi-currency.
- **Type consistency:** `set_default_account` RPC arg is named `target` everywhere (SQL + `setDefaultAccount`). `account_balances` columns match `AccountBalance`. `NewAccount` = `{name, opening_balance, is_default}` used by `createAccount`.
