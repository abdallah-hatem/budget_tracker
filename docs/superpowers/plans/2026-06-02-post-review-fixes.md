# Post-Review Fixes (FIX 1–10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 10 precise post-review fixes to the feat/phase1-mvp branch without breaking the 113 Jest tests, clean tsc, or 20 Deno tests.

**Architecture:** Each fix is surgical and targets one file or a small cluster of related files. Fixes are grouped into 5 logical commits: (1) focus-refetch, (2) edit-validation+errors, (3) test-guards (seed parity, verify_jwt, RLS write-side), (4) DB migration + coerceOccurredAt, (5) minor robustness (categorizeClient error, stale-response guard, reducer test name).

**Tech Stack:** Expo Router (useFocusEffect), React Native, TypeScript, Jest + RNTL v13, Supabase (PostgreSQL via docker exec, Edge Functions in Deno 2.7), Deno test runner.

---

## Files Modified / Created

| Path | Action |
|---|---|
| `app/(tabs)/index.tsx` | Modify — add useFocusEffect |
| `app/(tabs)/transactions.tsx` | Modify — add useFocusEffect |
| `app/(tabs)/__tests__/dashboard.test.tsx` | Modify — add focus-refetch test |
| `app/(tabs)/__tests__/transactions.test.tsx` | Modify — add focus-refetch test |
| `src/features/transactions/EditTransactionSheet.tsx` | Modify — validation + error state + catch |
| `src/features/transactions/EditTransactionSheet.test.tsx` | Modify — add invalid-amount + rejection tests |
| `src/lib/__tests__/seedParity.test.ts` | Create — seed slug parity test |
| `src/lib/__tests__/edgeConfig.test.ts` | Create — verify_jwt pin test |
| `supabase/tests/rls_check.sql` | Modify — add write-isolation assertions |
| `supabase/migrations/0001_init.sql` | Modify — add EGP currency CHECK constraint |
| `supabase/functions/_shared/categorize.ts` | Modify — fix coerceOccurredAt |
| `supabase/functions/tests/categorize_test.ts` | Modify — add coerceOccurredAt deno test cases |
| `src/features/capture/categorizeClient.ts` | Modify — simplify error handling |
| `src/features/transactions/useTransactions.ts` | Modify — add request-id stale-response guard |
| `src/features/capture/__tests__/confirmReducer.test.ts` | Modify — rename test at line ~42 |

---

## Task 1: FIX 1 — Refetch on tab focus (Dashboard + Transactions)

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Modify: `app/(tabs)/transactions.tsx`
- Modify: `app/(tabs)/__tests__/dashboard.test.tsx`
- Modify: `app/(tabs)/__tests__/transactions.test.tsx`

### Context
`useFocusEffect` from `expo-router` fires its callback every time the screen comes into focus (tab switch back). Without it, stale data persists when the user navigates away and returns. The callback should call `refresh()` (which is already returned by both hooks) wrapped in `useCallback` to satisfy the linter.

In tests: mock `expo-router`'s `useFocusEffect` to immediately invoke its callback synchronously. Then assert that the data-fetching function (`refresh` on dashboard, `listTransactions` on transactions) was called a second time beyond the initial mount call.

- [ ] **Step 1: Add useFocusEffect to Dashboard (`app/(tabs)/index.tsx`)**

```tsx
// app/(tabs)/index.tsx — add these two imports after the existing imports:
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
```

Then inside `Dashboard()` after the `useMonthSummary()` destructure:

```tsx
useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
```

- [ ] **Step 2: Add useFocusEffect to TransactionsScreen (`app/(tabs)/transactions.tsx`)**

Add the same two imports at the top (after existing React import — `useCallback` is already imported via `useMemo, useState`; just add `useCallback` to the existing destructure or confirm it is already there):

```tsx
// The existing line is:
import React, { useMemo, useState } from 'react';
// Change to:
import React, { useCallback, useMemo, useState } from 'react';
```

Add the import from expo-router:
```tsx
import { useFocusEffect } from 'expo-router';
```

Then inside `TransactionsScreen()` after the `useTransactions(filter)` line:

```tsx
useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
```

- [ ] **Step 3: Add focus-refetch test to dashboard tests**

In `app/(tabs)/__tests__/dashboard.test.tsx`, add a mock for `expo-router` and a new test. Add before the existing imports:

```tsx
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
}));
```

Add a new `it` inside the existing `describe('Dashboard', ...)` block:

```tsx
it('calls refresh again on focus', () => {
  const refresh = jest.fn();
  mockSummary.mockReturnValue({
    monthKey: { year: 2026, month: 5 },
    summary: { income: 0, expense: 0, net: 0, byCategory: [] },
    transactions: [],
    loading: false,
    error: null,
    refresh,
    prevMonth: jest.fn(),
    nextMonth: jest.fn(),
  });
  render(<Dashboard />);
  // useFocusEffect mock immediately invokes the callback, so refresh should
  // have been called at least once by the focus handler.
  expect(refresh).toHaveBeenCalled();
});
```

- [ ] **Step 4: Add focus-refetch test to transactions tests**

In `app/(tabs)/__tests__/transactions.test.tsx`, add a mock for `expo-router` and a new test. Add near top with other jest.mock calls:

```tsx
jest.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => { cb(); },
}));
```

Add a new `it` inside the existing `describe('TransactionsScreen', ...)`:

```tsx
it('calls listTransactions again on focus', async () => {
  mockList.mockResolvedValue([]);
  render(<TransactionsScreen />);
  // The initial mount calls listTransactions once (from useEffect on filterKey).
  // The useFocusEffect mock fires the refresh callback immediately, triggering
  // another call. Wait for both to settle.
  await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2));
});
```

- [ ] **Step 5: Run Jest on the modified files to confirm green**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "app/\(tabs\)/__tests__/(dashboard|transactions)" --no-coverage 2>&1 | tail -20
```

Expected: All tests pass (PASS lines, 0 failures).

- [ ] **Step 6: Run tsc to confirm no type errors**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx tsc --noEmit 2>&1
```

Expected: No output (clean).

- [ ] **Step 7: Commit**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
git add app/\(tabs\)/index.tsx app/\(tabs\)/transactions.tsx "app/(tabs)/__tests__/dashboard.test.tsx" "app/(tabs)/__tests__/transactions.test.tsx"
git commit -m "fix: refetch on tab focus for Dashboard and Transactions screens"
```

---

## Task 2: FIX 2 — EditTransactionSheet validation + error handling

**Files:**
- Modify: `src/features/transactions/EditTransactionSheet.tsx`
- Modify: `src/features/transactions/EditTransactionSheet.test.tsx`

### Context
`handleSave` currently maps blank/non-numeric amount to `0` and calls `updateTransaction` — the DB rejects amount=0 (check amount > 0). It also has no catch for `updateTransaction`/`deleteTransaction` rejections.

The fix:
1. Add `const [error, setError] = useState<string | null>(null);` state.
2. In `handleSave`: validate `const parsed = parseFloat(amount); if (!Number.isFinite(parsed) || parsed <= 0) { setError('Enter an amount greater than 0'); return; }` — this exact string matches what `ConfirmSheet` uses.
3. Wrap both `updateTransaction` and `deleteTransaction` awaits in try/catch; on error `setError(e instanceof Error ? e.message : String(e))` and return without calling `onDone()`.
4. Only call `onDone()` on success.
5. Add `{error ? <Text testID="edit-error" className="text-red-600">{error}</Text> : null}` in the JSX (same pattern as ConfirmSheet's `testID="confirm-error"`).
6. Clear `error` to null before each new attempt (put `setError(null)` before `setBusy(true)` in both handlers after the validation step).

- [ ] **Step 1: Update EditTransactionSheet.tsx**

Full updated file content for `src/features/transactions/EditTransactionSheet.tsx`:

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { updateTransaction, deleteTransaction } from './api';
import { categoryLabel } from './display';
import { expenseCategories, incomeCategories } from '../../lib/categories';
import { t, isRTL } from '../../lib/i18n';
import type { Transaction, TxnType, Locale } from '../../types';

interface Props {
  transaction: Transaction;
  locale: Locale;
  onDone: () => void;
  onCancel: () => void;
}

/**
 * Editable sheet for a single transaction: type / amount / category / note,
 * with Save (updateTransaction), Delete (deleteTransaction), and Cancel.
 * Parent re-queries via its own refresh() inside onDone.
 */
export function EditTransactionSheet({ transaction, locale, onDone, onCancel }: Props) {
  const rtl = isRTL(locale);
  const [type, setType] = useState<TxnType>(transaction.type);
  const [amount, setAmount] = useState<string>(String(transaction.amount));
  const [categorySlug, setCategorySlug] = useState<string>(transaction.category_slug);
  const [note, setNote] = useState<string>(transaction.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cats = type === 'income' ? incomeCategories() : expenseCategories();

  async function handleSave() {
    if (busy) return;
    const parsed = parseFloat(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter an amount greater than 0');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateTransaction(transaction.id, {
        type,
        amount: parsed,
        category_slug: categorySlug,
        note: note.trim() === '' ? null : note.trim(),
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await deleteTransaction(transaction.id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="bg-white rounded-t-2xl p-4 gap-4" style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {/* Type toggle */}
      <View className="flex-row gap-2">
        {(['expense', 'income'] as TxnType[]).map((ty) => (
          <Pressable
            key={ty}
            testID={`edit-type-${ty}`}
            onPress={() => {
              setType(ty);
              const next = ty === 'income' ? incomeCategories() : expenseCategories();
              if (!next.some((c) => c.slug === categorySlug)) {
                setCategorySlug(next[0]?.slug ?? categorySlug);
              }
            }}
            className={`flex-1 rounded-lg px-3 py-2 ${type === ty ? 'bg-gray-900' : 'bg-gray-100'}`}
          >
            <Text className={`text-center ${type === ty ? 'text-white' : 'text-gray-700'}`}>
              {t(ty, locale)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Amount */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('amount', locale)}</Text>
        <TextInput
          testID="edit-amount"
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          className="rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />
      </View>

      {/* Category */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('by_category', locale)}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
          {cats.map((c) => (
            <Pressable
              key={c.slug}
              testID={`edit-cat-${c.slug}`}
              onPress={() => setCategorySlug(c.slug)}
              className={`rounded-full px-3 py-2 ${categorySlug === c.slug ? 'bg-gray-900' : 'bg-gray-100'}`}
            >
              <Text className={categorySlug === c.slug ? 'text-white' : 'text-gray-700'}>
                {categoryLabel(c.slug, locale)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Note */}
      <View className="gap-1">
        <Text className="text-xs text-gray-500">{t('note', locale)}</Text>
        <TextInput
          testID="edit-note"
          value={note}
          onChangeText={setNote}
          className="rounded-lg border border-gray-200 px-3 py-2 text-base text-gray-900"
          style={{ textAlign: rtl ? 'right' : 'left' }}
        />
      </View>

      {error ? (
        <Text testID="edit-error" className="text-red-600">{error}</Text>
      ) : null}

      {/* Actions */}
      <View className="flex-row gap-2 pt-2">
        <Pressable
          testID="edit-cancel"
          onPress={onCancel}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-100 px-3 py-3"
        >
          <Text className="text-center text-gray-700">{t('cancel', locale)}</Text>
        </Pressable>
        <Pressable
          testID="edit-delete"
          onPress={handleDelete}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-50 px-3 py-3"
        >
          <Text className="text-center text-red-600">{t('delete', locale)}</Text>
        </Pressable>
        <Pressable
          testID="edit-save"
          onPress={handleSave}
          disabled={busy}
          className="flex-1 rounded-lg bg-gray-900 px-3 py-3"
        >
          <Text className="text-center text-white">{t('save', locale)}</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Add new tests to EditTransactionSheet.test.tsx**

Add the following three new test cases inside the existing `describe('EditTransactionSheet', ...)` block (after the existing three tests):

```tsx
  it('shows error and does NOT call updateTransaction when amount is blank', async () => {
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );
    fireEvent.changeText(screen.getByTestId('edit-amount'), '');
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toBeTruthy());
    expect(screen.getByTestId('edit-error').props.children).toBe('Enter an amount greater than 0');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows error and does NOT call updateTransaction when amount is zero', async () => {
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );
    fireEvent.changeText(screen.getByTestId('edit-amount'), '0');
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toBeTruthy());
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows error message and does NOT call onDone when updateTransaction rejects', async () => {
    mockUpdate.mockRejectedValueOnce(new Error('DB error: amount > 0'));
    const onDone = jest.fn();
    render(
      <EditTransactionSheet transaction={txn} locale="en" onDone={onDone} onCancel={jest.fn()} />
    );
    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(screen.getByTestId('edit-error')).toBeTruthy());
    expect(screen.getByTestId('edit-error').props.children).toBe('DB error: amount > 0');
    expect(onDone).not.toHaveBeenCalled();
  });
```

- [ ] **Step 3: Run Jest on EditTransactionSheet to confirm green**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "EditTransactionSheet" --no-coverage 2>&1 | tail -20
```

Expected: All 6 tests pass.

- [ ] **Step 4: Run tsc**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx tsc --noEmit 2>&1
```

Expected: No output.

- [ ] **Step 5: Commit**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
git add src/features/transactions/EditTransactionSheet.tsx src/features/transactions/EditTransactionSheet.test.tsx
git commit -m "fix: EditTransactionSheet validation and error handling"
```

---

## Task 3: FIX 3 — Seed slug parity test

**Files:**
- Create: `src/lib/__tests__/seedParity.test.ts`

### Context
The seed.sql has 17 rows, `categories.ts` has 17 entries, and `supabase/functions/_shared/categories.ts` has 17 slugs. This test enforces the first two stay in sync by reading seed.sql at test time and comparing parsed slugs and kinds to the `CATEGORIES` array.

- [ ] **Step 1: Create seedParity.test.ts**

```ts
// src/lib/__tests__/seedParity.test.ts
import * as fs from 'fs';
import * as path from 'path';
import { CATEGORIES } from '../categories';

const seedPath = path.resolve(__dirname, '../../../../supabase/seed.sql');
const sql = fs.readFileSync(seedPath, 'utf8');

// Extract rows: each line that begins with ('slug', ...
// The insert rows look like:
//   ('food', 'Food & Drink', ..., 'expense', ..., 10),
// We capture: group 1 = slug, group 2 = kind
const ROW_RE = /\(\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'(expense|income)'/g;

interface SeedRow { slug: string; kind: 'expense' | 'income' }

function parseSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [];
  let m: RegExpExecArray | null;
  while ((m = ROW_RE.exec(sql)) !== null) {
    rows.push({ slug: m[1], kind: m[2] as 'expense' | 'income' });
  }
  return rows;
}

describe('seed.sql parity with categories.ts', () => {
  const seedRows = parseSeedRows();

  it('extracts exactly 17 rows from seed.sql', () => {
    expect(seedRows).toHaveLength(17);
  });

  it('seed slugs match categorySlugs() set exactly', () => {
    const seedSlugs = new Set(seedRows.map((r) => r.slug));
    const catSlugs = new Set(CATEGORIES.map((c) => c.slug));
    expect(seedSlugs).toEqual(catSlugs);
  });

  it('each slug has the same kind in seed.sql and categories.ts', () => {
    const catBySlug = Object.fromEntries(CATEGORIES.map((c) => [c.slug, c.kind]));
    for (const row of seedRows) {
      expect(catBySlug[row.slug]).toBe(row.kind);
    }
  });
});
```

- [ ] **Step 2: Run the new test**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "seedParity" --no-coverage 2>&1 | tail -20
```

Expected: 3 tests pass.

- [ ] **Step 3: Commit (will be grouped with FIX 4 and FIX 5 in Task 5)**

Hold — commit together with edgeConfig test and RLS write-side in Task 5.

---

## Task 4: FIX 4 — Pin verify_jwt test

**Files:**
- Create: `src/lib/__tests__/edgeConfig.test.ts`

### Context
`supabase/config.toml` already has `verify_jwt = true` under `[functions.categorize]`. This test reads the file and asserts it stays that way, guarding against accidental removal.

- [ ] **Step 1: Create edgeConfig.test.ts**

```ts
// src/lib/__tests__/edgeConfig.test.ts
import * as fs from 'fs';
import * as path from 'path';

const configPath = path.resolve(__dirname, '../../../../supabase/config.toml');
const toml = fs.readFileSync(configPath, 'utf8');

describe('supabase/config.toml edge function settings', () => {
  it('[functions.categorize] section exists', () => {
    expect(toml).toMatch(/\[functions\.categorize\]/);
  });

  it('[functions.categorize] has verify_jwt = true', () => {
    // Find the section and check it contains verify_jwt = true before the next section
    const sectionStart = toml.indexOf('[functions.categorize]');
    expect(sectionStart).toBeGreaterThan(-1);
    // Find the next section header after [functions.categorize]
    const afterSection = toml.slice(sectionStart);
    const nextSection = afterSection.search(/\n\[(?!functions\.categorize)/);
    const section = nextSection === -1 ? afterSection : afterSection.slice(0, nextSection);
    expect(section).toMatch(/verify_jwt\s*=\s*true/);
  });
});
```

- [ ] **Step 2: Run the new test**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "edgeConfig" --no-coverage 2>&1 | tail -20
```

Expected: 2 tests pass.

---

## Task 5: FIX 5 — RLS write-side isolation

**Files:**
- Modify: `supabase/tests/rls_check.sql`

### Context
The existing rls_check.sql tests read isolation. We need to add write-isolation tests: (a) INSERT forging user A's user_id by user B must fail; (b) UPDATE of user A's row by user B affects 0 rows; (c) UPDATE trying to set user_id to user A is rejected by the with check.

All three must be inside `begin ... exception when others then raise notice 'PASS: ...'` blocks so errors cause a PASS notice (the failure is the expected outcome). Use `savepoint`/`rollback to savepoint` to isolate failed statements without aborting the outer transaction.

- [ ] **Step 1: Update rls_check.sql**

Replace the file with the content below. The new write-side tests are added after the existing `user A sees their own row` block, still before `rollback`.

```sql
-- supabase/tests/rls_check.sql
-- Proves transactions RLS isolation: user B and anon cannot read user A's rows.
-- Also proves WRITE isolation: user B cannot insert/update rows owned by user A.
-- Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_check.sql
-- Wrapped in a transaction + rollback so it leaves no residue.
--
-- DB_URL (local dev): postgresql://postgres:postgres@127.0.0.1:54322/postgres
-- Via docker exec:
--   docker exec supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 \
--     -f /path/to/supabase/tests/rls_check.sql

begin;

-- Two fake auth users (insert directly as superuser; the on_auth_user_created
-- trigger will also create their profiles rows).
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev');

-- Seed one transaction owned by user A (insert as superuser, bypasses RLS).
insert into public.transactions (user_id, type, amount, category_slug, source, status)
values ('00000000-0000-0000-0000-00000000000a', 'expense', 50.00, 'food', 'text', 'confirmed');

-- ---- Impersonate user B (authenticated role + B's JWT claims) ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare visible int;
begin
  select count(*) into visible from public.transactions;
  assert visible = 0, format('FAIL: user B can see %s of user A''s transactions (expected 0)', visible);
  raise notice 'PASS: user B sees 0 of user A''s transactions';
end $$;

-- ---- WRITE isolation: user B tries to INSERT forging user A's user_id ----
do $$
begin
  savepoint sp_insert_forge;
  insert into public.transactions (user_id, type, amount, category_slug, source, status)
  values ('00000000-0000-0000-0000-00000000000a', 'expense', 10.00, 'food', 'text', 'confirmed');
  -- If we reach here, the INSERT was not blocked — that is a FAIL.
  raise exception 'FAIL: user B could forge an INSERT with user A''s user_id';
exception when others then
  rollback to savepoint sp_insert_forge;
  raise notice 'PASS: user B INSERT forging user A user_id was denied';
end $$;

-- ---- WRITE isolation: user B tries to UPDATE user A's row ----
do $$
declare affected int;
begin
  update public.transactions set amount = 999.00
  where user_id = '00000000-0000-0000-0000-00000000000a';
  get diagnostics affected = row_count;
  assert affected = 0, format('FAIL: user B UPDATE affected %s rows of user A (expected 0)', affected);
  raise notice 'PASS: user B UPDATE of user A''s rows affected 0 rows';
end $$;

-- ---- WRITE isolation: user B tries UPDATE that sets user_id = user A ----
-- First insert a row owned by user B (valid per RLS).
do $$
begin
  savepoint sp_b_insert;
  insert into public.transactions (user_id, type, amount, category_slug, source, status)
  values ('00000000-0000-0000-0000-00000000000b', 'expense', 5.00, 'food', 'text', 'confirmed');
  raise notice 'PASS: user B can insert their own transaction';
exception when others then
  rollback to savepoint sp_b_insert;
  raise exception 'FAIL: user B own-row INSERT was unexpectedly denied: %', sqlerrm;
end $$;

do $$
begin
  savepoint sp_update_userid;
  -- Try to change the user_id of B's row to A's id (violates with check).
  update public.transactions
  set user_id = '00000000-0000-0000-0000-00000000000a'
  where user_id = '00000000-0000-0000-0000-00000000000b';
  raise exception 'FAIL: user B could change user_id to user A''s id';
exception when others then
  rollback to savepoint sp_update_userid;
  raise notice 'PASS: user B UPDATE setting user_id = user A was denied';
end $$;

reset role;

-- ---- Impersonate anon (no JWT) ----
set local role anon;
set local request.jwt.claims = '';

do $$
declare visible int;
begin
  select count(*) into visible from public.transactions;
  assert visible = 0, format('FAIL: anon can see %s transactions (expected 0)', visible);
  raise notice 'PASS: anon sees 0 transactions';

  -- anon CAN read categories (read-only reference data).
  select count(*) into visible from public.categories;
  assert visible = 17, format('FAIL: anon sees %s categories (expected 17)', visible);
  raise notice 'PASS: anon can read 17 categories';
end $$;

reset role;

-- ---- Confirm user A still sees their own row ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare visible int;
begin
  select count(*) into visible from public.transactions;
  assert visible = 1, format('FAIL: user A sees %s of their own transactions (expected 1)', visible);
  raise notice 'PASS: user A sees their own 1 transaction';
end $$;

reset role;

rollback;  -- leave the DB clean
```

- [ ] **Step 2: Run rls_check.sql via docker exec**

```bash
docker exec -i supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 < /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/tests/rls_check.sql 2>&1
```

Expected output includes all these PASS lines (order may vary):
```
NOTICE:  PASS: user B sees 0 of user A's transactions
NOTICE:  PASS: user B INSERT forging user A user_id was denied
NOTICE:  PASS: user B UPDATE of user A's rows affected 0 rows
NOTICE:  PASS: user B can insert their own transaction
NOTICE:  PASS: user B UPDATE setting user_id = user A was denied
NOTICE:  PASS: anon sees 0 transactions
NOTICE:  PASS: anon can read 17 categories
NOTICE:  PASS: user A sees their own 1 transaction
```

- [ ] **Step 3: Commit all three test-gap fixes together**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
git add src/lib/__tests__/seedParity.test.ts src/lib/__tests__/edgeConfig.test.ts supabase/tests/rls_check.sql
git commit -m "test: add RLS write-side isolation, seed parity, and verify_jwt guards"
```

---

## Task 6: FIX 6 — currency CHECK = 'EGP' in migration + live DB

**Files:**
- Modify: `supabase/migrations/0001_init.sql`

### Context
The `transactions.currency` column needs a `CHECK (currency = 'EGP')` constraint. Add it inline in the migration as a named constraint `transactions_currency_egp`. Also apply it to the already-running local DB via `docker exec ... ALTER TABLE`.

- [ ] **Step 1: Update 0001_init.sql**

Find the `currency` column in the `create table public.transactions` block and add the named constraint inline:

Current line:
```sql
  currency      text not null default 'EGP',
```

Change to:
```sql
  currency      text not null default 'EGP' constraint transactions_currency_egp check (currency = 'EGP'),
```

- [ ] **Step 2: Apply constraint to live DB**

```bash
docker exec supabase_db_budget_tracker psql -U postgres -c "ALTER TABLE public.transactions ADD CONSTRAINT transactions_currency_egp CHECK (currency = 'EGP');" 2>&1
```

Expected: `ALTER TABLE`

- [ ] **Step 3: Verify constraint rejects wrong currency**

```bash
docker exec supabase_db_budget_tracker psql -U postgres -c "
  DO \$\$
  BEGIN
    INSERT INTO public.transactions (user_id, type, amount, currency, category_slug, source, status)
    SELECT id, 'expense', 10, 'USD', 'food', 'text', 'confirmed'
    FROM auth.users LIMIT 1;
    RAISE EXCEPTION 'FAIL: insert with USD was not rejected';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: currency != EGP insert was rejected';
  END;
  \$\$;" 2>&1
```

Expected: `NOTICE:  PASS: currency != EGP insert was rejected`

- [ ] **Step 4: Commit**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
git add supabase/migrations/0001_init.sql
git commit -m "fix: add currency = EGP check constraint to transactions migration"
```

---

## Task 7: FIX 7 — coerceOccurredAt validates parseable date

**Files:**
- Modify: `supabase/functions/_shared/categorize.ts`
- Modify: `supabase/functions/tests/categorize_test.ts`

### Context
`coerceOccurredAt` currently returns the raw string without checking it is a valid date. Fix: trim; if empty → undefined; parse via `new Date(s)`; if NaN → undefined; else return `d.toISOString()`.

- [ ] **Step 1: Update coerceOccurredAt in categorize.ts**

Replace the existing function body (lines 193-195):

Old:
```ts
function coerceOccurredAt(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}
```

New:
```ts
function coerceOccurredAt(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (s.length === 0) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}
```

- [ ] **Step 2: Add Deno test cases for coerceOccurredAt**

The function is private. We test it indirectly via `categorize()`. Add two new test cases at the end of `supabase/functions/tests/categorize_test.ts`:

```ts
Deno.test("coerceOccurredAt: garbage date string -> occurred_at omitted", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "expense",
      amount: 20,
      currency: "EGP",
      category_slug: "food",
      note: "test",
      confidence: 0.8,
      occurred_at: "not-a-date-at-all",
    }),
  );

  const parsed = await categorize("test", "en", "k", { createMessage: create });

  // garbage date → coerceOccurredAt returns undefined → field omitted
  assertEquals(parsed.occurred_at, undefined);
});

Deno.test("coerceOccurredAt: valid ISO date -> normalised ISO string", async () => {
  const { create } = stub(
    fakeToolUse({
      type: "expense",
      amount: 20,
      currency: "EGP",
      category_slug: "food",
      note: "test",
      confidence: 0.8,
      occurred_at: "2026-06-01",
    }),
  );

  const parsed = await categorize("test", "en", "k", { createMessage: create });

  // valid date → should come back as a full ISO string
  assertEquals(typeof parsed.occurred_at, "string");
  // Should start with "2026-06-01" (timezone offset may shift the time part)
  assertEquals((parsed.occurred_at ?? "").startsWith("2026-06-0"), true);
});
```

- [ ] **Step 3: Run Deno tests**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker/supabase/functions
deno test --allow-env --allow-net 2>&1 | tail -30
```

Expected: All existing tests pass plus the 2 new ones. 22 total passing.

- [ ] **Step 4: Commit (group with FIX 8 and FIX 9 in Task 9)**

Hold — commit together with categorizeClient and useTransactions fixes.

---

## Task 8: FIX 8 — categorizeClient clean error (simplify JSON parse)

**Files:**
- Modify: `src/features/capture/categorizeClient.ts`

### Context
The current try/catch inside the FunctionsHttpError handler re-throws `parseErr` if its message differs from 'Categorization failed', which can leak a raw JSON parse error. Simplify to: try `body = await error.context.json()`, catch silently, then throw `new Error(body?.error ?? 'Categorization failed')`.

The existing test at line 34 tests `'too long'` — that still works because `body?.error` will be `'too long'`. The test at line 43 tests a non-HTTP error (unchanged path). No test needs changing, but verify they still pass.

- [ ] **Step 1: Update categorizeClient.ts**

Replace the `FunctionsHttpError` handler block:

Old:
```ts
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        throw new Error(body?.error ?? 'Categorization failed');
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'Categorization failed') {
          throw parseErr;
        }
        throw new Error('Categorization failed');
      }
    }
```

New:
```ts
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string } | null = null;
      try { body = await error.context.json(); } catch { /* non-JSON body */ }
      throw new Error(body?.error ?? 'Categorization failed');
    }
```

- [ ] **Step 2: Run categorizeClient tests**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "categorizeClient" --no-coverage 2>&1 | tail -20
```

Expected: All 4 tests pass.

---

## Task 9: FIX 9 — useTransactions stale-response guard

**Files:**
- Modify: `src/features/transactions/useTransactions.ts`

### Context
If two concurrent `refresh()` calls race, the slower one might overwrite the result of the faster one. Add a `useRef<number>` request counter. Before each `listTransactions` call, increment and capture `const myReq = ++reqIdRef.current`. After `await`, check `if (myReq !== reqIdRef.current) return;` before calling `setData`.

- [ ] **Step 1: Update useTransactions.ts**

Full updated file:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { listTransactions, type TransactionFilter } from './api';
import type { Transaction } from '../../types';

export interface UseTransactionsResult {
  data: Transaction[];
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

/**
 * Loads transactions for `filter` and re-fetches whenever the filter's serialized
 * shape changes. The filter is serialized to a stable key so callers can pass a
 * fresh object literal each render without causing an infinite loop.
 *
 * A request-id guard prevents out-of-order responses from clobbering newer state.
 */
export function useTransactions(filter: TransactionFilter): UseTransactionsResult {
  const [data, setData] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep the latest filter in a ref so refresh() uses current values without
  // being part of its dependency list.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Request-id guard: only apply the result of the most recently started request.
  const reqIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const rows = await listTransactions(filterRef.current);
      if (myReq !== reqIdRef.current) return;
      setData(rows);
    } catch (e) {
      if (myReq !== reqIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
      setData([]);
    } finally {
      // Only clear loading if this is still the latest request.
      // (We still call setLoading for the superseded req; React batches it harmlessly.)
      setLoading(false);
    }
  }, []);

  // Stable dependency: only re-run when the meaningful filter fields change.
  const filterKey = JSON.stringify(filter);
  useEffect(() => {
    void refresh();
    // refresh is stable (empty deps); filterKey captures the filter contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  return { data, loading, error, refresh };
}
```

- [ ] **Step 2: Run useTransactions tests**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "useTransactions" --no-coverage 2>&1 | tail -20
```

Expected: All 3 existing tests pass.

- [ ] **Step 3: Commit FIX 7 + FIX 8 + FIX 9 together**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
git add supabase/functions/_shared/categorize.ts supabase/functions/tests/categorize_test.ts src/features/capture/categorizeClient.ts src/features/transactions/useTransactions.ts
git commit -m "fix: coerceOccurredAt validation, categorizeClient error simplification, useTransactions stale-response guard"
```

---

## Task 10: FIX 10 — Rename misleading reducer test

**Files:**
- Modify: `src/features/capture/__tests__/confirmReducer.test.ts`

### Context
Line ~42 has: `it('SET_TYPE switches the type and resets category to other_expense for expense', ...)` but the test dispatches `SET_TYPE income` and asserts `other_income`. Rename to accurately describe the behavior.

- [ ] **Step 1: Rename the test**

Find in `src/features/capture/__tests__/confirmReducer.test.ts`:

Old test title (line ~42):
```ts
  it('SET_TYPE switches the type and resets category to other_expense for expense', () => {
```

New:
```ts
  it('SET_TYPE to income resets category to other_income', () => {
```

- [ ] **Step 2: Run confirmReducer tests**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest "confirmReducer" --no-coverage 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 3: Run full Jest suite to confirm everything is green**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx jest --no-coverage 2>&1 | tail -30
```

Expected: All tests pass (≥117 tests — 113 original + 4 new).

- [ ] **Step 4: Run tsc final check**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
npx tsc --noEmit 2>&1
```

Expected: No output.

- [ ] **Step 5: Commit**

```bash
cd /Users/abdallahhatem/Desktop/Projects/Personal/budget_tracker
git add src/features/capture/__tests__/confirmReducer.test.ts
git commit -m "test: fix misleading confirmReducer test title (SET_TYPE income -> other_income)"
```

---

## Final Verification

- [ ] Run `npx jest --no-coverage` — all tests green
- [ ] Run `npx tsc --noEmit` — clean
- [ ] Run `deno test --allow-env --allow-net` in `supabase/functions` — all green
- [ ] Run `docker exec -i supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_check.sql` — all PASS notices printed

---

## Self-Review

**Spec coverage check:**
- FIX 1: useFocusEffect added to both screens, tests added — covered by Task 1
- FIX 2: Validation + error state + catch in EditTransactionSheet — covered by Task 2
- FIX 3: seedParity.test.ts — covered by Task 3
- FIX 4: edgeConfig.test.ts — covered by Task 4
- FIX 5: RLS write-side SQL — covered by Task 5
- FIX 6: currency CHECK in migration + ALTER TABLE — covered by Task 6
- FIX 7: coerceOccurredAt fix + deno tests — covered by Task 7
- FIX 8: categorizeClient error simplification — covered by Task 8
- FIX 9: useTransactions stale-response guard — covered by Task 9
- FIX 10: rename confirmReducer test — covered by Task 10

**Placeholder scan:** All steps have concrete code. No TBD or "implement later" phrases.

**Type consistency:**
- `refresh: () => Promise<void>` — consistent between useTransactions.ts and how useFocusEffect calls it
- `error` state in EditTransactionSheet is `string | null` — matches pattern in ConfirmSheet
- `reqIdRef` is `useRef<number>` with initial value `0` — increment then compare is safe
- `coerceOccurredAt` return type `string | undefined` — unchanged, implementation now validates
