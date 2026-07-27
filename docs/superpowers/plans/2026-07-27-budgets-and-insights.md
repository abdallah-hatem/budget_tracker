# Budgets & Spending Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user cap spending per category (and overall) on monthly/weekly cycles, and get one proactive daily push when they approach, hit, or are on pace to exceed a cap — plus anomaly nudges for categories with no cap.

**Architecture:** Two new user-owned tables (`budgets`, `budget_alerts`). A daily `budget-check` Edge Function, scheduled via pg_cron + pg_net, aggregates confirmed expense spend per cycle, evaluates thresholds/pace/insights, deduplicates against `budget_alerts`, and sends at most one Expo push per user per day. Client adds a Budgets screen (from Settings) and a dashboard summary card. All client work is JS → OTA-able.

**Tech Stack:** Supabase Postgres (RLS, pg_cron, pg_net), Deno Edge Functions, Expo SDK 54 / React Native 0.81, expo-router, expo-notifications, Jest + Deno test.

## Global Constraints

- **Spend = `status = 'confirmed'` AND `type = 'expense'` only.** Matches `summarize()` (`src/features/dashboard/summary.ts:35`) and the Statistics filter, so the Budgets screen never disagrees with Statistics for the same period.
- **Weekly cycle starts Saturday** (Egypt norm). Not configurable in v1.
- **Monthly cycle** starts on `profiles.month_start_day` (default `1`).
- **Client changes must remain JS-only** (no new native module, no new notification *category* or action buttons) so the feature ships by OTA with no rebuild.
- **Every user-facing string** is added to `src/lib/i18n.ts` with both `en` and `ar`; every layout honors `isRTL(locale)`.
- **RLS on every new table**, using `to authenticated` + an ownership predicate; UPDATE policies carry both `using` and `with check`.
- **Cron migration steps are exception-safe** (`do $$ begin ... exception when others then null; end $$`), matching `supabase/migrations/0013_purge_raw_text.sql`.
- **Money is `numeric(12,2)` in SQL, `number` in TS.** Percentages are integers 0–100.
- **Verification gate for every task:** `npx tsc --noEmit`, `npx jest`, and `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/` must all pass before commit.

## File Structure

**Server**
| File | Responsibility |
| --- | --- |
| `supabase/migrations/0017_budgets.sql` | `budgets` + `budget_alerts` tables, RLS, `profiles.month_start_day` |
| `supabase/migrations/0018_budget_check_cron.sql` | pg_cron + pg_net daily schedule |
| `supabase/functions/_shared/budgetCycles.ts` | Pure cycle math (bounds, keys, elapsed fraction) |
| `supabase/functions/_shared/budgetEval.ts` | Pure evaluation → alert descriptors (thresholds, pace, insights, recap, collapsing) |
| `supabase/functions/budget-check/index.ts` | Handler: injectable deps, orchestration, dedup, push |
| `supabase/functions/tests/budget_cycles_test.ts` | Cycle math tests |
| `supabase/functions/tests/budget_eval_test.ts` | Evaluation tests |
| `supabase/functions/tests/budget_check_test.ts` | Handler tests (no network/DB) |

**Client**
| File | Responsibility |
| --- | --- |
| `src/features/budgets/types.ts` | `Budget`, `NewBudget`, `BudgetProgress` |
| `src/features/budgets/api.ts` | Supabase CRUD |
| `src/features/budgets/progress.ts` | Pure: percentage, tone, at-risk selection |
| `src/features/budgets/useBudgets.ts` | Load budgets + compute progress from transactions |
| `app/budgets.tsx` | Budgets screen (list, add/edit form) |
| `src/features/budgets/BudgetSummaryCard.tsx` | Dashboard summary card |
| `src/features/budgets/__tests__/progress.test.ts` | Pure-helper tests |
| `src/features/budgets/__tests__/api.test.ts` | CRUD tests |

---

### Task 1: Database schema — budgets, alerts ledger, month_start_day

**Files:**
- Create: `supabase/migrations/0017_budgets.sql`

**Interfaces:**
- Consumes: existing `public.profiles`, `public.categories`, `auth.users`.
- Produces: tables `public.budgets` (columns `id, user_id, scope, category_slug, period, amount, warn_pct, created_at, updated_at`) and `public.budget_alerts` (columns `id, user_id, budget_id, kind, cycle_key, category_slug, meta, sent_at`); column `public.profiles.month_start_day int not null default 1`.

- [ ] **Step 1: Create the migration file**

Run: `supabase migration new budgets`

Rename the generated file to `supabase/migrations/0017_budgets.sql` if the timestamp prefix differs from the repo's sequential convention (existing files are `0001_`…`0016_`).

- [ ] **Step 2: Write the schema**

```sql
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
```

- [ ] **Step 3: Apply locally and verify**

Run: `supabase migration up`

Then verify the constraints actually bite:

```bash
supabase db query "insert into public.budgets (user_id, scope, category_slug, period, amount) values ('00000000-0000-0000-0000-000000000000','overall','food','monthly',100);"
```

Expected: FAILS with a violation of `budgets_scope_category_ck` (overall must not carry a category). If `supabase db query` is unavailable on this CLI version, run the same SQL through the local DB with `psql` or the Studio SQL editor.

- [ ] **Step 4: Confirm no advisor regressions**

Run: `supabase db advisors --local` (or MCP `get_advisors`)
Expected: no new ERROR-level findings for `budgets` / `budget_alerts` (both have RLS enabled).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0017_budgets.sql
git commit -m "feat(db): budgets + budget_alerts tables and profiles.month_start_day"
```

---

### Task 2: Persist month_start_day from the client

**Files:**
- Modify: `src/features/dashboard/MonthStartProvider.tsx`
- Test: `src/features/dashboard/__tests__/monthStartSync.test.ts` (create)

**Interfaces:**
- Consumes: `profiles.month_start_day` from Task 1; the existing Supabase client at `src/lib/supabase.ts`.
- Produces: `syncMonthStartDay(day: number): Promise<void>` exported from `src/features/dashboard/MonthStartProvider.tsx`, called on mount and on every change.

- [ ] **Step 1: Write the failing test**

Create `src/features/dashboard/__tests__/monthStartSync.test.ts`:

```typescript
const mockUpdate = jest.fn(() => ({ eq: mockEq }));
const mockEq = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ update: mockUpdate })),
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'u1' } } })) },
  },
}));

import { syncMonthStartDay } from '../MonthStartProvider';

describe('syncMonthStartDay', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the day to the profile row', async () => {
    await syncMonthStartDay(15);
    expect(mockUpdate).toHaveBeenCalledWith({ month_start_day: 15 });
    expect(mockEq).toHaveBeenCalledWith('id', 'u1');
  });

  it('never throws when the write fails', async () => {
    mockEq.mockResolvedValueOnce({ error: { message: 'offline' } } as never);
    await expect(syncMonthStartDay(3)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest monthStartSync`
Expected: FAIL — `syncMonthStartDay is not a function` (not yet exported).

- [ ] **Step 3: Implement the sync**

In `src/features/dashboard/MonthStartProvider.tsx`, add the import and the exported function:

```typescript
import { supabase } from '@/src/lib/supabase';

/**
 * Mirror the device-local month-start day onto the user's profile row. The
 * daily budget-check job runs server-side and cannot read AsyncStorage, so it
 * reads profiles.month_start_day instead. Best-effort: never throws, so a
 * failed write can't break the settings UI.
 */
export async function syncMonthStartDay(day: number): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    await supabase.from('profiles').update({ month_start_day: day }).eq('id', uid);
  } catch {
    /* best-effort */
  }
}
```

Then call it from `setStartDay` so every change writes through:

```typescript
  const setStartDay = useCallback((d: number) => {
    setDay(d);
    void AsyncStorage.setItem(KEY, String(d));
    void syncMonthStartDay(d);
  }, []);
```

And backfill once the stored value is read, so existing users get their real day onto the profile without touching the setting. Add this effect after the existing load effect (it runs when `ready` flips true):

```typescript
  useEffect(() => {
    if (!ready) return;
    void syncMonthStartDay(startDay);
  }, [ready, startDay]);
```

Note: the existing `setStartDay` body may differ slightly (it sets state and writes AsyncStorage). Keep whatever it already does and only add the `syncMonthStartDay(d)` line.

- [ ] **Step 4: Run tests**

Run: `npx jest monthStartSync && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/features/dashboard/MonthStartProvider.tsx src/features/dashboard/__tests__/monthStartSync.test.ts
git commit -m "feat(budgets): sync month_start_day to the profile for the server job"
```

---

### Task 3: Cycle math (`budgetCycles.ts`)

**Files:**
- Create: `supabase/functions/_shared/budgetCycles.ts`
- Test: `supabase/functions/tests/budget_cycles_test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `type Period = 'monthly' | 'weekly'`
  - `interface Cycle { start: Date; end: Date; key: string; elapsedFraction: number }`
  - `function monthlyCycle(now: Date, startDay: number): Cycle`
  - `function weeklyCycle(now: Date): Cycle`
  - `function cycleFor(period: Period, now: Date, startDay: number): Cycle`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/tests/budget_cycles_test.ts`:

```typescript
import { assertEquals, assert } from "@std/assert";
import { monthlyCycle, weeklyCycle, cycleFor } from "../_shared/budgetCycles.ts";

Deno.test("monthlyCycle: startDay 1 spans the calendar month", () => {
  const c = monthlyCycle(new Date("2026-07-15T12:00:00Z"), 1);
  assertEquals(c.start.toISOString(), "2026-07-01T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-08-01T00:00:00.000Z");
  assertEquals(c.key, "2026-07");
});

Deno.test("monthlyCycle: custom startDay before today -> cycle began this month", () => {
  const c = monthlyCycle(new Date("2026-07-20T00:00:00Z"), 10);
  assertEquals(c.start.toISOString(), "2026-07-10T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-08-10T00:00:00.000Z");
  assertEquals(c.key, "2026-07");
});

Deno.test("monthlyCycle: custom startDay after today -> cycle began last month", () => {
  const c = monthlyCycle(new Date("2026-07-05T00:00:00Z"), 10);
  assertEquals(c.start.toISOString(), "2026-06-10T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-07-10T00:00:00.000Z");
  // The key names the cycle by its START month.
  assertEquals(c.key, "2026-06");
});

Deno.test("monthlyCycle: December rolls into the next year", () => {
  const c = monthlyCycle(new Date("2026-12-20T00:00:00Z"), 10);
  assertEquals(c.end.toISOString(), "2027-01-10T00:00:00.000Z");
});

Deno.test("weeklyCycle: starts Saturday", () => {
  // 2026-07-15 is a Wednesday; the preceding Saturday is 2026-07-11.
  const c = weeklyCycle(new Date("2026-07-15T12:00:00Z"));
  assertEquals(c.start.getUTCDay(), 6); // 6 = Saturday
  assertEquals(c.start.toISOString(), "2026-07-11T00:00:00.000Z");
  assertEquals(c.end.toISOString(), "2026-07-18T00:00:00.000Z");
});

Deno.test("weeklyCycle: on a Saturday the cycle starts that day", () => {
  const c = weeklyCycle(new Date("2026-07-11T09:00:00Z"));
  assertEquals(c.start.toISOString(), "2026-07-11T00:00:00.000Z");
});

Deno.test("weekly key is year + ISO-ish week number and differs across weeks", () => {
  const a = weeklyCycle(new Date("2026-07-11T00:00:00Z"));
  const b = weeklyCycle(new Date("2026-07-18T00:00:00Z"));
  assert(a.key.startsWith("2026-W"));
  assert(a.key !== b.key);
});

Deno.test("elapsedFraction is 0..1 and grows through the cycle", () => {
  const early = monthlyCycle(new Date("2026-07-02T00:00:00Z"), 1);
  const late = monthlyCycle(new Date("2026-07-28T00:00:00Z"), 1);
  assert(early.elapsedFraction > 0 && early.elapsedFraction < 0.2);
  assert(late.elapsedFraction > 0.8 && late.elapsedFraction <= 1);
});

Deno.test("cycleFor dispatches on period", () => {
  const now = new Date("2026-07-15T00:00:00Z");
  assertEquals(cycleFor("monthly", now, 1).key, monthlyCycle(now, 1).key);
  assertEquals(cycleFor("weekly", now, 1).key, weeklyCycle(now).key);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_cycles_test.ts`
Expected: FAIL — module `../_shared/budgetCycles.ts` not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/budgetCycles.ts`:

```typescript
// Pure cycle math for budgets. All computation is in UTC: the server job runs
// in UTC and the app's amounts are date-stamped, not time-critical, so a fixed
// reference frame keeps cycle keys stable and testable.

export type Period = "monthly" | "weekly";

export interface Cycle {
  /** Inclusive start. */
  start: Date;
  /** Exclusive end. */
  end: Date;
  /** Stable dedup key: "2026-07" (monthly) or "2026-W29" (weekly). */
  key: string;
  /** How far through the cycle we are, 0..1. Used for pace projection. */
  elapsedFraction: number;
}

const DAY_MS = 86_400_000;

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

function elapsed(now: Date, start: Date, end: Date): number {
  const span = end.getTime() - start.getTime();
  if (span <= 0) return 1;
  const done = (now.getTime() - start.getTime()) / span;
  return Math.min(1, Math.max(0, done));
}

/**
 * The monthly cycle containing `now`, starting on `startDay` of the month.
 * If `now` is before this month's start day, the active cycle began LAST month.
 * `startDay` is clamped to 1..28 so every month has the day.
 */
export function monthlyCycle(now: Date, startDay: number): Cycle {
  const day = Math.min(28, Math.max(1, Math.floor(startDay) || 1));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const startsThisMonth = now.getUTCDate() >= day;
  const start = startsThisMonth ? utc(y, m, day) : utc(y, m - 1, day);
  const end = startsThisMonth ? utc(y, m + 1, day) : utc(y, m, day);
  const key = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;
  return { start, end, key, elapsedFraction: elapsed(now, start, end) };
}

/** The weekly cycle containing `now`, starting Saturday (Egypt convention). */
export function weeklyCycle(now: Date): Cycle {
  // getUTCDay: 0=Sun .. 6=Sat. Days since the most recent Saturday.
  const back = (now.getUTCDay() + 1) % 7;
  const start = utc(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - back);
  const end = new Date(start.getTime() + 7 * DAY_MS);
  // Week number = whole weeks since Jan 1 of the start's year, 1-based.
  const jan1 = utc(start.getUTCFullYear(), 0, 1);
  const week = Math.floor((start.getTime() - jan1.getTime()) / (7 * DAY_MS)) + 1;
  const key = `${start.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  return { start, end, key, elapsedFraction: elapsed(now, start, end) };
}

export function cycleFor(period: Period, now: Date, startDay: number): Cycle {
  return period === "weekly" ? weeklyCycle(now) : monthlyCycle(now, startDay);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_cycles_test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/budgetCycles.ts supabase/functions/tests/budget_cycles_test.ts
git commit -m "feat(budgets): pure cycle math for monthly and weekly budget periods"
```

---

### Task 4: Threshold + pace evaluation (`budgetEval.ts`)

**Files:**
- Create: `supabase/functions/_shared/budgetEval.ts`
- Test: `supabase/functions/tests/budget_eval_test.ts`

**Interfaces:**
- Consumes: `Period`, `Cycle` from `budgetCycles.ts` (Task 3).
- Produces:
  - `interface BudgetRow { id: string; scope: 'overall' | 'category'; category_slug: string | null; period: Period; amount: number; warn_pct: number }`
  - `interface AlertDescriptor { budgetId: string | null; kind: string; categorySlug: string | null; meta: Record<string, unknown> }`
  - `function evaluateBudget(b: BudgetRow, spend: number, cycle: Cycle): AlertDescriptor | null`
  - `const PACE_MIN_ELAPSED = 0.25`

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/tests/budget_eval_test.ts`:

```typescript
import { assertEquals, assert } from "@std/assert";
import { evaluateBudget, PACE_MIN_ELAPSED, type BudgetRow } from "../_shared/budgetEval.ts";
import type { Cycle } from "../_shared/budgetCycles.ts";

const budget = (over: Partial<BudgetRow> = {}): BudgetRow => ({
  id: "b1",
  scope: "category",
  category_slug: "food",
  period: "monthly",
  amount: 1000,
  warn_pct: 80,
  ...over,
});

const cycle = (elapsedFraction: number): Cycle => ({
  start: new Date("2026-07-01T00:00:00Z"),
  end: new Date("2026-08-01T00:00:00Z"),
  key: "2026-07",
  elapsedFraction,
});

Deno.test("under the warning line -> no alert", () => {
  assertEquals(evaluateBudget(budget(), 500, cycle(0.9)), null);
});

Deno.test("at the warning line -> approaching", () => {
  const a = evaluateBudget(budget(), 800, cycle(0.9));
  assertEquals(a?.kind, "approaching");
  assertEquals(a?.budgetId, "b1");
  assertEquals(a?.categorySlug, "food");
  assertEquals(a?.meta.pct, 80);
});

Deno.test("exactly at the cap -> reached, not exceeded", () => {
  assertEquals(evaluateBudget(budget(), 1000, cycle(0.9))?.kind, "reached");
});

Deno.test("over the cap -> exceeded (outranks approaching)", () => {
  const a = evaluateBudget(budget(), 1300, cycle(0.9));
  assertEquals(a?.kind, "exceeded");
  assertEquals(a?.meta.over, 300);
});

Deno.test("on pace to exceed -> pace alert when not yet over", () => {
  // Half the cycle gone, 60% spent -> projects to 1200 > 1000.
  const a = evaluateBudget(budget(), 600, cycle(0.5));
  assertEquals(a?.kind, "pace");
  assertEquals(a?.meta.projected, 1200);
});

Deno.test("pace is suppressed before the minimum elapsed fraction", () => {
  // 10% elapsed, tiny spend that would extrapolate absurdly high.
  assert(PACE_MIN_ELAPSED > 0.1);
  assertEquals(evaluateBudget(budget(), 200, cycle(0.1)), null);
});

Deno.test("pace does not fire when the projection lands under the cap", () => {
  assertEquals(evaluateBudget(budget(), 300, cycle(0.5)), null);
});

Deno.test("approaching outranks pace", () => {
  // 85% spent at 50% elapsed: both would trigger; approaching wins.
  assertEquals(evaluateBudget(budget(), 850, cycle(0.5))?.kind, "approaching");
});

Deno.test("overall scope carries a null categorySlug", () => {
  const a = evaluateBudget(
    budget({ scope: "overall", category_slug: null }), 1200, cycle(0.9),
  );
  assertEquals(a?.kind, "exceeded");
  assertEquals(a?.categorySlug, null);
});

Deno.test("zero spend never alerts", () => {
  assertEquals(evaluateBudget(budget(), 0, cycle(0.99)), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_eval_test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `supabase/functions/_shared/budgetEval.ts`:

```typescript
// Pure evaluation of one budget against its cycle spend. Returns AT MOST ONE
// descriptor per budget — the highest-severity state — so a single overspent
// category can never produce three notifications in the same run.
import type { Cycle, Period } from "./budgetCycles.ts";

export interface BudgetRow {
  id: string;
  scope: "overall" | "category";
  category_slug: string | null;
  period: Period;
  amount: number;
  warn_pct: number;
}

export interface AlertDescriptor {
  budgetId: string | null;
  kind: string;
  categorySlug: string | null;
  meta: Record<string, unknown>;
}

/**
 * Below this elapsed fraction a projection is extrapolated from too little of
 * the cycle to mean anything (2 days in, one big grocery run reads as "you'll
 * spend 15x your budget"), so pace alerts are suppressed.
 */
export const PACE_MIN_ELAPSED = 0.25;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function evaluateBudget(
  b: BudgetRow,
  spend: number,
  cycle: Cycle,
): AlertDescriptor | null {
  if (spend <= 0 || b.amount <= 0) return null;

  const pct = Math.round((spend / b.amount) * 100);
  const base = { budgetId: b.id, categorySlug: b.category_slug };

  // Severity order: exceeded > reached > approaching > pace.
  if (spend > b.amount) {
    return { ...base, kind: "exceeded", meta: { pct, spend: round2(spend), amount: b.amount, over: round2(spend - b.amount) } };
  }
  if (spend === b.amount) {
    return { ...base, kind: "reached", meta: { pct, spend: round2(spend), amount: b.amount } };
  }
  if (pct >= b.warn_pct) {
    return { ...base, kind: "approaching", meta: { pct, spend: round2(spend), amount: b.amount, remaining: round2(b.amount - spend) } };
  }
  if (cycle.elapsedFraction >= PACE_MIN_ELAPSED) {
    const projected = round2(spend / cycle.elapsedFraction);
    if (projected > b.amount) {
      return { ...base, kind: "pace", meta: { pct, spend: round2(spend), amount: b.amount, projected, over: round2(projected - b.amount) } };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_eval_test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/budgetEval.ts supabase/functions/tests/budget_eval_test.ts
git commit -m "feat(budgets): threshold and pace evaluation with severity ordering"
```

---

### Task 5: Insight detection (spike + frequency)

**Files:**
- Modify: `supabase/functions/_shared/budgetEval.ts`
- Test: `supabase/functions/tests/budget_eval_test.ts` (append)

**Interfaces:**
- Consumes: `AlertDescriptor` (Task 4), `Cycle` (Task 3).
- Produces:
  - `interface CategoryHistory { categorySlug: string; cycleSpend: number; avg3mMonthly: number; weekCount: number; avgWeekCount: number }`
  - `function detectInsights(hist: CategoryHistory[], cycle: Cycle, limit?: number): AlertDescriptor[]`
  - `const SPIKE_MIN_EGP = 200`, `const SPIKE_RATIO = 1.4`, `const FREQ_MIN_COUNT = 4`, `const FREQ_RATIO = 1.5`

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/tests/budget_eval_test.ts`:

```typescript
import { detectInsights, SPIKE_MIN_EGP, type CategoryHistory } from "../_shared/budgetEval.ts";

const hist = (over: Partial<CategoryHistory> = {}): CategoryHistory => ({
  categorySlug: "food",
  cycleSpend: 0,
  avg3mMonthly: 1000,
  weekCount: 0,
  avgWeekCount: 2,
  ...over,
});

Deno.test("spike: 40%+ above the prorated 3-month average", () => {
  // Half the month elapsed, average pace would be 500; 800 is +60%.
  const out = detectInsights([hist({ cycleSpend: 800 })], cycle(0.5));
  assertEquals(out.length, 1);
  assertEquals(out[0].kind, "insight_spike");
  assertEquals(out[0].categorySlug, "food");
});

Deno.test("spike: normal spending produces no insight", () => {
  assertEquals(detectInsights([hist({ cycleSpend: 520 })], cycle(0.5)).length, 0);
});

Deno.test("spike: suppressed below the EGP floor even at a big ratio", () => {
  // 10x the average, but the absolute amount is trivial.
  const out = detectInsights(
    [hist({ cycleSpend: SPIKE_MIN_EGP - 50, avg3mMonthly: 20 })], cycle(0.5),
  );
  assertEquals(out.filter((o) => o.kind === "insight_spike").length, 0);
});

Deno.test("spike: no history (avg 0) produces no insight", () => {
  assertEquals(
    detectInsights([hist({ cycleSpend: 5000, avg3mMonthly: 0 })], cycle(0.5)).length, 0,
  );
});

Deno.test("frequency: unusual transaction count fires", () => {
  const out = detectInsights([hist({ weekCount: 6, avgWeekCount: 2 })], cycle(0.5));
  assertEquals(out.some((o) => o.kind === "insight_frequency"), true);
});

Deno.test("frequency: below the minimum count never fires", () => {
  const out = detectInsights([hist({ weekCount: 3, avgWeekCount: 1 })], cycle(0.5));
  assertEquals(out.some((o) => o.kind === "insight_frequency"), false);
});

Deno.test("insights are capped at the limit, strongest first", () => {
  const out = detectInsights(
    [
      hist({ categorySlug: "a", cycleSpend: 700 }),   // +40%
      hist({ categorySlug: "b", cycleSpend: 2000 }),  // +300%
      hist({ categorySlug: "c", cycleSpend: 1200 }),  // +140%
    ],
    cycle(0.5),
    2,
  );
  assertEquals(out.length, 2);
  assertEquals(out[0].categorySlug, "b");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_eval_test.ts`
Expected: FAIL — `detectInsights` is not exported.

- [ ] **Step 3: Implement**

Append to `supabase/functions/_shared/budgetEval.ts`:

```typescript
/** Per-category history used for anomaly detection (budgeted or not). */
export interface CategoryHistory {
  categorySlug: string;
  /** Spend so far in the current monthly cycle. */
  cycleSpend: number;
  /** Trailing 3-month average monthly spend for this category. */
  avg3mMonthly: number;
  /** Transactions in the current week. */
  weekCount: number;
  /** Typical transactions per week for this category. */
  avgWeekCount: number;
}

/** Absolute floor so trivial categories can't produce a "300% spike". */
export const SPIKE_MIN_EGP = 200;
export const SPIKE_RATIO = 1.4;
export const FREQ_MIN_COUNT = 4;
export const FREQ_RATIO = 1.5;

/**
 * Detect notable shifts across ALL categories, budgeted or not. Returns the
 * strongest `limit` insights so the daily push stays short.
 */
export function detectInsights(
  hist: CategoryHistory[],
  cycle: Cycle,
  limit = 2,
): AlertDescriptor[] {
  const found: Array<AlertDescriptor & { strength: number }> = [];

  for (const h of hist) {
    // --- Spike: cycle spend vs the average PRORATED to how far we are in. ---
    if (h.avg3mMonthly > 0 && h.cycleSpend >= SPIKE_MIN_EGP) {
      const expected = h.avg3mMonthly * Math.max(cycle.elapsedFraction, 0.01);
      const ratio = h.cycleSpend / expected;
      if (ratio >= SPIKE_RATIO) {
        found.push({
          budgetId: null,
          kind: "insight_spike",
          categorySlug: h.categorySlug,
          meta: {
            spend: round2(h.cycleSpend),
            expected: round2(expected),
            pctAbove: Math.round((ratio - 1) * 100),
          },
          strength: ratio,
        });
      }
    }

    // --- Frequency: this week's count vs the usual weekly count. ---
    if (h.avgWeekCount > 0 && h.weekCount >= FREQ_MIN_COUNT) {
      const ratio = h.weekCount / h.avgWeekCount;
      if (ratio >= FREQ_RATIO) {
        found.push({
          budgetId: null,
          kind: "insight_frequency",
          categorySlug: h.categorySlug,
          meta: { count: h.weekCount, usual: round2(h.avgWeekCount) },
          strength: ratio,
        });
      }
    }
  }

  return found
    .sort((a, b) => b.strength - a.strength)
    .slice(0, limit)
    .map(({ strength: _strength, ...rest }) => rest);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_eval_test.ts`
Expected: PASS (17 tests total in this file).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/budgetEval.ts supabase/functions/tests/budget_eval_test.ts
git commit -m "feat(budgets): spike and frequency insight detection for all categories"
```

---

### Task 6: The `budget-check` handler

**Files:**
- Create: `supabase/functions/budget-check/index.ts`
- Test: `supabase/functions/tests/budget_check_test.ts`

**Interfaces:**
- Consumes: `cycleFor` (Task 3), `evaluateBudget` / `detectInsights` / `BudgetRow` / `CategoryHistory` / `AlertDescriptor` (Tasks 4–5), `ExpoPushMessage` shape from `ingest-sms/index.ts`.
- Produces: `interface BudgetCheckDeps`, `async function handleBudgetCheck(req: Request, deps: BudgetCheckDeps): Promise<Response>`.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/tests/budget_check_test.ts`:

```typescript
import { assertEquals, assert } from "@std/assert";
import { handleBudgetCheck, type BudgetCheckDeps } from "../budget-check/index.ts";

const NOW = new Date("2026-07-20T03:00:00Z");

function makeDeps(over: Partial<BudgetCheckDeps> = {}): BudgetCheckDeps {
  return {
    now: () => NOW,
    listActiveUsers: () => Promise.resolve([{ userId: "u1", monthStartDay: 1, locale: "en" }]),
    listBudgets: () => Promise.resolve([
      { id: "b1", scope: "category", category_slug: "food", period: "monthly", amount: 1000, warn_pct: 80 },
    ]),
    getCycleSpend: () => Promise.resolve({ overall: 900, byCategory: { food: 900 } }),
    getCategoryHistory: () => Promise.resolve([]),
    listSentAlerts: () => Promise.resolve([]),
    recordAlerts: () => Promise.resolve(),
    getPushTokens: () => Promise.resolve(["ExponentPushToken[x]"]),
    sendPush: () => Promise.resolve(),
    ...over,
  };
}

const post = () => new Request("http://localhost", { method: "POST" });

Deno.test("sends ONE push summarizing the day's alerts", async () => {
  const sent: unknown[][] = [];
  const res = await handleBudgetCheck(post(), makeDeps({
    sendPush: (msgs) => { sent.push(msgs); return Promise.resolve(); },
  }));
  assertEquals(res.status, 200);
  assertEquals(sent.length, 1);
  assertEquals(sent[0].length, 1); // one token -> one message
});

Deno.test("records the alert so it is not repeated", async () => {
  let recorded: unknown[] = [];
  await handleBudgetCheck(post(), makeDeps({
    recordAlerts: (_u, rows) => { recorded = rows; return Promise.resolve(); },
  }));
  assertEquals(recorded.length, 1);
  assertEquals((recorded[0] as { kind: string }).kind, "approaching");
  assertEquals((recorded[0] as { cycle_key: string }).cycle_key, "2026-07");
});

Deno.test("an already-sent alert is skipped and no push goes out", async () => {
  let pushed = false;
  await handleBudgetCheck(post(), makeDeps({
    listSentAlerts: () => Promise.resolve([
      { budget_id: "b1", kind: "approaching", cycle_key: "2026-07", category_slug: "food" },
    ]),
    sendPush: () => { pushed = true; return Promise.resolve(); },
  }));
  assertEquals(pushed, false);
});

Deno.test("no budgets and no insights -> no push, still 200", async () => {
  let pushed = false;
  const res = await handleBudgetCheck(post(), makeDeps({
    listBudgets: () => Promise.resolve([]),
    sendPush: () => { pushed = true; return Promise.resolve(); },
  }));
  assertEquals(res.status, 200);
  assertEquals(pushed, false);
});

Deno.test("a user with no push token records alerts but sends nothing", async () => {
  let pushed = false;
  let recorded = 0;
  await handleBudgetCheck(post(), makeDeps({
    getPushTokens: () => Promise.resolve([]),
    sendPush: () => { pushed = true; return Promise.resolve(); },
    recordAlerts: (_u, rows) => { recorded = rows.length; return Promise.resolve(); },
  }));
  assertEquals(pushed, false);
  assertEquals(recorded, 1);
});

Deno.test("insights are included alongside budget alerts", async () => {
  let recorded: Array<{ kind: string }> = [];
  await handleBudgetCheck(post(), makeDeps({
    getCategoryHistory: () => Promise.resolve([
      { categorySlug: "shopping", cycleSpend: 3000, avg3mMonthly: 1000, weekCount: 0, avgWeekCount: 0 },
    ]),
    recordAlerts: (_u, rows) => { recorded = rows as Array<{ kind: string }>; return Promise.resolve(); },
  }));
  assert(recorded.some((r) => r.kind === "insight_spike"));
});

Deno.test("one user failing does not abort the others", async () => {
  let recordedUsers: string[] = [];
  await handleBudgetCheck(post(), makeDeps({
    listActiveUsers: () => Promise.resolve([
      { userId: "bad", monthStartDay: 1, locale: "en" },
      { userId: "good", monthStartDay: 1, locale: "en" },
    ]),
    getCycleSpend: (userId) => {
      if (userId === "bad") throw new Error("db blew up");
      return Promise.resolve({ overall: 900, byCategory: { food: 900 } });
    },
    recordAlerts: (u) => { recordedUsers.push(u); return Promise.resolve(); },
  }));
  assertEquals(recordedUsers, ["good"]);
});

Deno.test("GET is rejected", async () => {
  const res = await handleBudgetCheck(
    new Request("http://localhost", { method: "GET" }), makeDeps(),
  );
  assertEquals(res.status, 405);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_check_test.ts`
Expected: FAIL — module `../budget-check/index.ts` not found.

- [ ] **Step 3: Implement the handler**

Create `supabase/functions/budget-check/index.ts`:

```typescript
// Edge Function: budget-check
// Invoked once daily by pg_cron + pg_net. For every user with budgets (or
// enough history for insights) it aggregates this cycle's CONFIRMED expense
// spend, evaluates thresholds / pace / insights, drops anything already sent
// this cycle, and delivers AT MOST ONE push per user.
//
// Every DB/network touch is behind `deps` so the tests run with no network.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { cycleFor, type Cycle } from "../_shared/budgetCycles.ts";
import {
  detectInsights,
  evaluateBudget,
  type AlertDescriptor,
  type BudgetRow,
  type CategoryHistory,
} from "../_shared/budgetEval.ts";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface ActiveUser {
  userId: string;
  monthStartDay: number;
  locale: string;
}

export interface SentAlert {
  budget_id: string | null;
  kind: string;
  cycle_key: string;
  category_slug: string | null;
}

export interface AlertRow {
  user_id: string;
  budget_id: string | null;
  kind: string;
  cycle_key: string;
  category_slug: string | null;
  meta: Record<string, unknown>;
}

export interface BudgetCheckDeps {
  now: () => Date;
  listActiveUsers: () => Promise<ActiveUser[]>;
  listBudgets: (userId: string) => Promise<BudgetRow[]>;
  getCycleSpend: (
    userId: string,
    start: Date,
    end: Date,
  ) => Promise<{ overall: number; byCategory: Record<string, number> }>;
  getCategoryHistory: (userId: string, cycle: Cycle) => Promise<CategoryHistory[]>;
  listSentAlerts: (userId: string, cycleKeys: string[]) => Promise<SentAlert[]>;
  recordAlerts: (userId: string, rows: AlertRow[]) => Promise<void>;
  getPushTokens: (userId: string) => Promise<string[]>;
  sendPush: (messages: ExpoPushMessage[]) => Promise<void>;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Identity of an alert for dedup purposes — mirrors the DB unique index. */
function dedupKey(a: { budget_id?: string | null; budgetId?: string | null; kind: string; cycle_key?: string; cycleKey?: string; category_slug?: string | null; categorySlug?: string | null }): string {
  const budget = a.budget_id ?? a.budgetId ?? "";
  const cycle = a.cycle_key ?? a.cycleKey ?? "";
  const cat = a.category_slug ?? a.categorySlug ?? "";
  return `${budget}|${a.kind}|${cycle}|${cat}`;
}

/** Short human line per alert; the push body joins these with " · ". */
export function alertLine(a: AlertDescriptor, label: string): string {
  const m = a.meta as Record<string, number>;
  switch (a.kind) {
    case "exceeded": return `${label} over by E£${m.over}`;
    case "reached": return `${label} at 100%`;
    case "approaching": return `${label} ${m.pct}%`;
    case "pace": return `${label} on pace +E£${m.over}`;
    case "insight_spike": return `${label} up ${m.pctAbove}%`;
    case "insight_frequency": return `${label} ${m.count}x this week`;
    default: return label;
  }
}

export async function handleBudgetCheck(
  req: Request,
  deps: BudgetCheckDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  const now = deps.now();
  const users = await deps.listActiveUsers();
  let notified = 0;

  for (const user of users) {
    // One user's failure must never abort the whole run.
    try {
      const budgets = await deps.listBudgets(user.userId);
      const monthly = cycleFor("monthly", now, user.monthStartDay);
      const weekly = cycleFor("weekly", now, user.monthStartDay);

      // Spend per cycle kind — fetched once each, not per budget.
      const monthlySpend = await deps.getCycleSpend(user.userId, monthly.start, monthly.end);
      const weeklySpend = budgets.some((b) => b.period === "weekly")
        ? await deps.getCycleSpend(user.userId, weekly.start, weekly.end)
        : { overall: 0, byCategory: {} as Record<string, number> };

      const descriptors: Array<AlertDescriptor & { cycleKey: string }> = [];

      for (const b of budgets) {
        const cycle = b.period === "weekly" ? weekly : monthly;
        const spendSet = b.period === "weekly" ? weeklySpend : monthlySpend;
        const spend = b.scope === "overall"
          ? spendSet.overall
          : spendSet.byCategory[b.category_slug ?? ""] ?? 0;
        const d = evaluateBudget(b, spend, cycle);
        if (d) descriptors.push({ ...d, cycleKey: cycle.key });
      }

      const history = await deps.getCategoryHistory(user.userId, monthly);
      for (const d of detectInsights(history, monthly)) {
        descriptors.push({ ...d, cycleKey: monthly.key });
      }

      if (descriptors.length === 0) continue;

      // Drop anything already sent for this cycle.
      const sent = await deps.listSentAlerts(user.userId, [monthly.key, weekly.key]);
      const seen = new Set(sent.map(dedupKey));
      const fresh = descriptors.filter((d) => !seen.has(dedupKey(d)));
      if (fresh.length === 0) continue;

      await deps.recordAlerts(
        user.userId,
        fresh.map((d) => ({
          user_id: user.userId,
          budget_id: d.budgetId,
          kind: d.kind,
          cycle_key: d.cycleKey,
          category_slug: d.categorySlug,
          meta: d.meta,
        })),
      );

      const tokens = await deps.getPushTokens(user.userId);
      if (tokens.length === 0) continue;

      // ONE push per user: join the top few lines.
      const body = fresh
        .slice(0, 3)
        .map((d) => alertLine(d, d.categorySlug ?? "Overall"))
        .join(" · ");
      await deps.sendPush(
        tokens.map((to) => ({
          to,
          title: "Budget check",
          body,
          data: { url: "/budgets" },
        })),
      );
      notified++;
    } catch (_e) {
      continue;
    }
  }

  return json({ ok: true, users: users.length, notified }, 200);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_check_test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the whole Deno suite for regressions**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/`
Expected: all previously passing tests still pass (100 pre-existing + the new ones).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/budget-check/index.ts supabase/functions/tests/budget_check_test.ts
git commit -m "feat(budgets): budget-check handler with dedup and one-push-per-day"
```

---

### Task 7: Wire the real dependencies + schedule the cron

**Files:**
- Modify: `supabase/functions/budget-check/index.ts` (append the real `Deno.serve` wiring)
- Create: `supabase/migrations/0018_budget_check_cron.sql`

**Interfaces:**
- Consumes: `handleBudgetCheck` + `BudgetCheckDeps` (Task 6); tables from Task 1.
- Produces: a deployed `budget-check` function and a daily `cron.schedule('budget-check-daily', ...)` job.

- [ ] **Step 1: Append the production wiring**

At the bottom of `supabase/functions/budget-check/index.ts`:

```typescript
// --- Production wiring (skipped under test, which imports the handler only) ---
if (import.meta.main) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const deps: BudgetCheckDeps = {
    now: () => new Date(),

    async listActiveUsers() {
      // Users holding at least one budget. Insight-only users are out of scope
      // for v1 delivery: without a budget there is no opt-in signal to notify.
      const { data } = await supabase
        .from("budgets")
        .select("user_id, profiles!inner(month_start_day, locale)");
      const seen = new Map<string, ActiveUser>();
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const id = row.user_id as string;
        if (seen.has(id)) continue;
        const p = row.profiles as { month_start_day?: number; locale?: string } | null;
        seen.set(id, {
          userId: id,
          monthStartDay: p?.month_start_day ?? 1,
          locale: p?.locale ?? "en",
        });
      }
      return [...seen.values()];
    },

    async listBudgets(userId) {
      const { data } = await supabase
        .from("budgets")
        .select("id, scope, category_slug, period, amount, warn_pct")
        .eq("user_id", userId);
      return (data ?? []).map((b) => ({ ...b, amount: Number(b.amount) })) as BudgetRow[];
    },

    async getCycleSpend(userId, start, end) {
      const { data } = await supabase
        .from("transactions")
        .select("amount, category_slug")
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .eq("type", "expense")
        .gte("occurred_at", start.toISOString())
        .lt("occurred_at", end.toISOString());
      let overall = 0;
      const byCategory: Record<string, number> = {};
      for (const t of (data ?? []) as Array<{ amount: number; category_slug: string }>) {
        const amt = Number(t.amount) || 0;
        overall += amt;
        byCategory[t.category_slug] = (byCategory[t.category_slug] ?? 0) + amt;
      }
      return { overall, byCategory };
    },

    async getCategoryHistory(userId, cycle) {
      // Trailing 3 months before this cycle started, for the baseline average.
      const histStart = new Date(cycle.start);
      histStart.setUTCMonth(histStart.getUTCMonth() - 3);
      const { data } = await supabase
        .from("transactions")
        .select("amount, category_slug, occurred_at")
        .eq("user_id", userId)
        .eq("status", "confirmed")
        .eq("type", "expense")
        .gte("occurred_at", histStart.toISOString())
        .lt("occurred_at", cycle.end.toISOString());

      const rows = (data ?? []) as Array<{ amount: number; category_slug: string; occurred_at: string }>;
      const weekStart = new Date(cycle.end.getTime() - 7 * 86_400_000);
      const acc = new Map<string, { cycleSpend: number; histSpend: number; weekCount: number; histCount: number }>();
      for (const t of rows) {
        const at = new Date(t.occurred_at);
        const amt = Number(t.amount) || 0;
        const e = acc.get(t.category_slug) ?? { cycleSpend: 0, histSpend: 0, weekCount: 0, histCount: 0 };
        if (at >= cycle.start) {
          e.cycleSpend += amt;
          if (at >= weekStart) e.weekCount++;
        } else {
          e.histSpend += amt;
          e.histCount++;
        }
        acc.set(t.category_slug, e);
      }
      return [...acc.entries()].map(([categorySlug, e]) => ({
        categorySlug,
        cycleSpend: e.cycleSpend,
        avg3mMonthly: e.histSpend / 3,
        weekCount: e.weekCount,
        avgWeekCount: e.histCount / 13, // ~13 weeks in 3 months
      }));
    },

    async listSentAlerts(userId, cycleKeys) {
      const { data } = await supabase
        .from("budget_alerts")
        .select("budget_id, kind, cycle_key, category_slug")
        .eq("user_id", userId)
        .in("cycle_key", cycleKeys);
      return (data ?? []) as SentAlert[];
    },

    async recordAlerts(_userId, rows) {
      // Ignore conflicts: the unique index is the real dedup guarantee if two
      // runs ever overlap.
      await supabase.from("budget_alerts").upsert(rows, { ignoreDuplicates: true });
    },

    async getPushTokens(userId) {
      const { data } = await supabase
        .from("push_tokens")
        .select("token")
        .eq("user_id", userId);
      return (data ?? []).map((r: { token: string }) => r.token);
    },

    async sendPush(messages) {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(messages),
      });
    },
  };

  Deno.serve((req) => handleBudgetCheck(req, deps));
}
```

**Before writing this, confirm the push-token table name and column** — read `supabase/functions/ingest-sms/index.ts` (its `getPushTokens` implementation, around line 386) and copy the exact table and column names it uses. If they differ from `push_tokens` / `token`, use the names from `ingest-sms`.

- [ ] **Step 2: Verify types and that tests still pass**

Run: `cd supabase/functions && deno check --node-modules-dir=auto budget-check/index.ts && deno test --allow-all --node-modules-dir=auto tests/`
Expected: check OK; all tests pass (the `import.meta.main` guard keeps the wiring out of tests).

- [ ] **Step 3: Deploy the function**

Run: `supabase functions deploy budget-check --project-ref pzyadiwfjmjsafssxshc`
Expected: "Deployed Functions on project pzyadiwfjmjsafssxshc: budget-check".

- [ ] **Step 4: Write the cron migration**

Create `supabase/migrations/0018_budget_check_cron.sql`:

```sql
-- ---------------------------------------------------------------------------
-- Schedule the daily budget-check Edge Function via pg_cron + pg_net.
-- Every step is exception-safe so the migration never fails in an environment
-- without the extensions (matches 0013_purge_raw_text.sql).
--
-- The service-role key is read from Vault rather than inlined here, so it never
-- lands in migration history. Set it once per project:
--   select vault.create_secret('<service-role-key>', 'service_role_key');
-- ---------------------------------------------------------------------------
do $$ begin execute 'create extension if not exists pg_cron'; exception when others then null; end $$;
do $$ begin execute 'create extension if not exists pg_net'; exception when others then null; end $$;

do $$ begin perform cron.unschedule('budget-check-daily'); exception when others then null; end $$;

do $$
begin
  perform cron.schedule(
    'budget-check-daily',
    '0 3 * * *',
    $job$
      select net.http_post(
        url     := 'https://pzyadiwfjmjsafssxshc.supabase.co/functions/v1/budget-check',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' ||
                       (select decrypted_secret from vault.decrypted_secrets
                         where name = 'service_role_key' limit 1)
                   ),
        body    := '{}'::jsonb
      );
    $job$
  );
exception when others then null;
end $$;
```

- [ ] **Step 5: Store the service-role key in Vault, then apply**

In the Supabase SQL editor (or via `supabase db query`), run once — substituting the project's real service-role key:

```sql
select vault.create_secret('<service-role-key>', 'service_role_key');
```

Then apply the migration:

```bash
SUPABASE_DB_PASSWORD=<db-pass> supabase db push --yes
```

- [ ] **Step 6: Verify the job is scheduled and fires**

```bash
supabase db query "select jobname, schedule, active from cron.job where jobname = 'budget-check-daily';"
```
Expected: one row, `active = t`.

Then invoke the function directly once to confirm the endpoint works end-to-end:

```bash
curl -s -X POST https://pzyadiwfjmjsafssxshc.supabase.co/functions/v1/budget-check \
  -H "Authorization: Bearer <service-role-key>" -H "Content-Type: application/json" -d '{}'
```
Expected: `{"ok":true,"users":<n>,"notified":<n>}`.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/budget-check/index.ts supabase/migrations/0018_budget_check_cron.sql
git commit -m "feat(budgets): wire budget-check to Supabase and schedule it daily"
```

---

### Task 8: Client budget types, API, and progress helpers

**Files:**
- Create: `src/features/budgets/types.ts`, `src/features/budgets/api.ts`, `src/features/budgets/progress.ts`
- Test: `src/features/budgets/__tests__/progress.test.ts`, `src/features/budgets/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `budgets` table (Task 1); the Supabase client at `src/lib/supabase.ts`.
- Produces:
  - `type BudgetScope = 'overall' | 'category'`, `type BudgetPeriod = 'monthly' | 'weekly'`
  - `interface Budget { id, user_id, scope, category_slug, period, amount, warn_pct }`
  - `type NewBudget = { scope, category_slug, period, amount, warn_pct }`
  - `listBudgets(): Promise<Budget[]>`, `createBudget(b: NewBudget): Promise<Budget>`, `updateBudget(id: string, patch: Partial<NewBudget>): Promise<Budget>`, `deleteBudget(id: string): Promise<void>`
  - `interface BudgetProgress { budget: Budget; spent: number; pct: number; remaining: number; tone: 'ok' | 'warn' | 'over' }`
  - `computeProgress(budget: Budget, spent: number): BudgetProgress`
  - `atRisk(list: BudgetProgress[], limit?: number): BudgetProgress[]`

- [ ] **Step 1: Write the failing progress tests**

Create `src/features/budgets/__tests__/progress.test.ts`:

```typescript
import { computeProgress, atRisk } from '../progress';
import type { Budget } from '../types';

const b = (over: Partial<Budget> = {}): Budget => ({
  id: 'b1',
  user_id: 'u1',
  scope: 'category',
  category_slug: 'food',
  period: 'monthly',
  amount: 1000,
  warn_pct: 80,
  ...over,
});

describe('computeProgress', () => {
  it('computes pct, remaining and an ok tone below the warning line', () => {
    const p = computeProgress(b(), 400);
    expect(p.pct).toBe(40);
    expect(p.remaining).toBe(600);
    expect(p.tone).toBe('ok');
  });

  it('flags warn at the warning threshold', () => {
    expect(computeProgress(b(), 800).tone).toBe('warn');
  });

  it('flags over at and beyond the cap', () => {
    expect(computeProgress(b(), 1000).tone).toBe('over');
    expect(computeProgress(b(), 1500).tone).toBe('over');
  });

  it('clamps remaining at zero when overspent', () => {
    expect(computeProgress(b(), 1500).remaining).toBe(0);
  });

  it('reports pct above 100 when overspent (bar caps separately)', () => {
    expect(computeProgress(b(), 1500).pct).toBe(150);
  });

  it('handles a zero-spend budget', () => {
    const p = computeProgress(b(), 0);
    expect(p.pct).toBe(0);
    expect(p.tone).toBe('ok');
  });
});

describe('atRisk', () => {
  it('returns the highest-pct budgets first, limited', () => {
    const list = [
      computeProgress(b({ id: '1' }), 200),
      computeProgress(b({ id: '2' }), 950),
      computeProgress(b({ id: '3' }), 1400),
    ];
    const out = atRisk(list, 2);
    expect(out.map((p) => p.budget.id)).toEqual(['3', '2']);
  });

  it('excludes budgets that are not near their cap', () => {
    const list = [computeProgress(b({ id: '1' }), 100)];
    expect(atRisk(list)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest budgets/__tests__/progress`
Expected: FAIL — cannot find module `../progress`.

- [ ] **Step 3: Implement types and progress**

Create `src/features/budgets/types.ts`:

```typescript
export type BudgetScope = 'overall' | 'category';
export type BudgetPeriod = 'monthly' | 'weekly';

export interface Budget {
  id: string;
  user_id: string;
  scope: BudgetScope;
  /** null when scope is 'overall'. */
  category_slug: string | null;
  period: BudgetPeriod;
  amount: number;
  warn_pct: number;
}

export type NewBudget = Pick<
  Budget,
  'scope' | 'category_slug' | 'period' | 'amount' | 'warn_pct'
>;

export interface BudgetProgress {
  budget: Budget;
  spent: number;
  /** Can exceed 100 when overspent; the bar clamps its own width. */
  pct: number;
  /** Never negative. */
  remaining: number;
  tone: 'ok' | 'warn' | 'over';
}
```

Create `src/features/budgets/progress.ts`:

```typescript
import type { Budget, BudgetProgress } from './types';

/** Spend vs cap, with the tone the UI colors the bar by. */
export function computeProgress(budget: Budget, spent: number): BudgetProgress {
  const amount = budget.amount > 0 ? budget.amount : 0;
  const pct = amount > 0 ? Math.round((spent / amount) * 100) : 0;
  const tone: BudgetProgress['tone'] =
    amount > 0 && spent >= amount ? 'over' : pct >= budget.warn_pct ? 'warn' : 'ok';
  return {
    budget,
    spent,
    pct,
    remaining: Math.max(0, amount - spent),
    tone,
  };
}

/** The budgets worth surfacing on the dashboard: warn/over, worst first. */
export function atRisk(list: BudgetProgress[], limit = 3): BudgetProgress[] {
  return list
    .filter((p) => p.tone !== 'ok')
    .sort((a, b) => b.pct - a.pct)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run the progress tests**

Run: `npx jest budgets/__tests__/progress`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing API tests**

Create `src/features/budgets/__tests__/api.test.ts`:

```typescript
const mockFrom = jest.fn();
jest.mock('@/src/lib/supabase', () => ({ supabase: { from: (...a: unknown[]) => mockFrom(...a) } }));

import { listBudgets, createBudget, deleteBudget } from '../api';

describe('budgets api', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists budgets', async () => {
    const order = jest.fn(() => Promise.resolve({ data: [{ id: 'b1' }], error: null }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ order })) });
    await expect(listBudgets()).resolves.toEqual([{ id: 'b1' }]);
    expect(mockFrom).toHaveBeenCalledWith('budgets');
  });

  it('throws the supabase error on failure', async () => {
    const order = jest.fn(() => Promise.resolve({ data: null, error: { message: 'nope' } }));
    mockFrom.mockReturnValue({ select: jest.fn(() => ({ order })) });
    await expect(listBudgets()).rejects.toThrow('nope');
  });

  it('creates a budget and returns the row', async () => {
    const single = jest.fn(() => Promise.resolve({ data: { id: 'new' }, error: null }));
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => ({ select }));
    mockFrom.mockReturnValue({ insert });
    const out = await createBudget({
      scope: 'category', category_slug: 'food', period: 'monthly', amount: 500, warn_pct: 80,
    });
    expect(out).toEqual({ id: 'new' });
    expect(insert).toHaveBeenCalled();
  });

  it('deletes by id', async () => {
    const eq = jest.fn(() => Promise.resolve({ error: null }));
    mockFrom.mockReturnValue({ delete: jest.fn(() => ({ eq })) });
    await deleteBudget('b1');
    expect(eq).toHaveBeenCalledWith('id', 'b1');
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `npx jest budgets/__tests__/api`
Expected: FAIL — cannot find module `../api`.

- [ ] **Step 7: Implement the API**

Create `src/features/budgets/api.ts`:

```typescript
import { supabase } from '@/src/lib/supabase';
import type { Budget, NewBudget } from './types';

/** All of the signed-in user's budgets (RLS scopes the rows). */
export async function listBudgets(): Promise<Budget[]> {
  const { data, error } = await supabase
    .from('budgets')
    .select('id, user_id, scope, category_slug, period, amount, warn_pct')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Budget[];
}

export async function createBudget(row: NewBudget): Promise<Budget> {
  const { data, error } = await supabase.from('budgets').insert(row).select().single();
  if (error) throw new Error(error.message);
  return data as Budget;
}

export async function updateBudget(id: string, patch: Partial<NewBudget>): Promise<Budget> {
  const { data, error } = await supabase
    .from('budgets')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Budget;
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
```

**Note:** `createBudget` relies on the DB to stamp `user_id`. Check whether other tables in this repo do that with a default/trigger (see how `src/features/categories/api.ts` inserts). If they instead pass `user_id` explicitly from the session, do the same here.

- [ ] **Step 8: Run both test files + tsc**

Run: `npx jest budgets && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add src/features/budgets/
git commit -m "feat(budgets): client types, CRUD api, and progress helpers"
```

---

### Task 9: Budgets screen

**Files:**
- Create: `app/budgets.tsx`, `src/features/budgets/useBudgets.ts`
- Modify: `app/_layout.tsx` (register the route), `src/lib/i18n.ts` (strings), `app/(tabs)/settings.tsx` (entry row)

**Interfaces:**
- Consumes: `listBudgets` / `createBudget` / `deleteBudget` (Task 8), `computeProgress` (Task 8), `useTransactions`, `useMonthStart`, `expenseCategories` / `incomeCategories`, `categoryLabel`, `CollapsibleCard`, `Money`, `CategoryAvatar`, `PressableScale`.
- Produces: route `/budgets`; `useBudgets(): { progress: BudgetProgress[]; loading: boolean; refresh: () => Promise<void> }`.

- [ ] **Step 1: Add the i18n strings**

In `src/lib/i18n.ts`, add next to the other section strings:

```typescript
  // ── Budgets ─────────────────────────────────────────────────────────────────
  'budgets.section': { en: 'Budgets', ar: 'الميزانيات' },
  'budgets.title': { en: 'Budgets', ar: 'الميزانيات' },
  'budgets.subtitle': {
    en: 'Set a spending cap per category or overall. You get a daily nudge as you approach it.',
    ar: 'حدد سقفًا للإنفاق لكل فئة أو إجمالاً. ستصلك تنبيهات يومية عند الاقتراب منه.',
  },
  'budgets.empty': { en: 'No budgets yet.', ar: 'لا توجد ميزانيات بعد.' },
  'budgets.add': { en: '+ Add budget', ar: '+ إضافة ميزانية' },
  'budgets.overall': { en: 'Overall', ar: 'الإجمالي' },
  'budgets.monthly': { en: 'Monthly', ar: 'شهري' },
  'budgets.weekly': { en: 'Weekly', ar: 'أسبوعي' },
  'budgets.amount': { en: 'Cap amount', ar: 'قيمة السقف' },
  'budgets.warnAt': { en: 'Warn at %', ar: 'التنبيه عند %' },
  'budgets.spentOf': { en: 'spent of', ar: 'من أصل' },
  'budgets.remaining': { en: 'left', ar: 'متبقي' },
  'budgets.over': { en: 'over', ar: 'تجاوز' },
```

- [ ] **Step 2: Implement the data hook**

Create `src/features/budgets/useBudgets.ts`:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listBudgets } from './api';
import { computeProgress } from './progress';
import type { Budget, BudgetProgress } from './types';
import { useTransactions } from '@/src/features/transactions/useTransactions';
import { useMonthStart } from '@/src/features/dashboard/MonthStartProvider';

/** Start of the current monthly cycle, honoring the custom month-start day. */
export function monthlyCycleStart(now: Date, startDay: number): Date {
  const day = Math.min(28, Math.max(1, startDay || 1));
  const d = new Date(now.getFullYear(), now.getMonth(), day);
  if (now.getDate() < day) d.setMonth(d.getMonth() - 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of the current week (Saturday). */
export function weeklyCycleStart(now: Date): Date {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Loads budgets and pairs each with its cycle-to-date spend. Spend counts only
 * CONFIRMED expenses, matching summarize() and the Statistics screen.
 */
export function useBudgets(): {
  progress: BudgetProgress[];
  loading: boolean;
  refresh: () => Promise<void>;
} {
  const { startDay } = useMonthStart();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const from = useMemo(() => {
    // Fetch from the earlier of the two cycle starts so both are covered.
    const m = monthlyCycleStart(now, startDay);
    const w = weeklyCycleStart(now);
    return (m < w ? m : w).toISOString();
  }, [now, startDay]);

  const filter = useMemo(
    () => ({ from, to: now.toISOString(), status: 'confirmed' as const }),
    [from, now],
  );
  const { data: txns } = useTransactions(filter);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setBudgets(await listBudgets());
    } catch {
      setBudgets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const progress = useMemo(() => {
    const monthStart = monthlyCycleStart(now, startDay);
    const weekStart = weeklyCycleStart(now);
    return budgets.map((b) => {
      const since = b.period === 'weekly' ? weekStart : monthStart;
      let spent = 0;
      for (const t of txns ?? []) {
        if (t.type !== 'expense' || t.status !== 'confirmed') continue;
        if (new Date(t.occurred_at) < since) continue;
        if (b.scope === 'category' && t.category_slug !== b.category_slug) continue;
        spent += t.amount;
      }
      return computeProgress(b, spent);
    });
  }, [budgets, txns, now, startDay]);

  return { progress, loading, refresh };
}
```

**Before writing this, confirm `useTransactions`' filter shape and returned field names** by reading `src/features/transactions/useTransactions.ts` and the `TransactionFilter` interface in `src/features/transactions/api.ts:5-11`. Use its exact property names.

- [ ] **Step 3: Build the screen**

Create `app/budgets.tsx`. Model the layout on `app/statistics.tsx` (same `Screen` wrapper, `MonthStartProvider`, spacing, and colors) and the add/edit form on `src/features/notifications/NotificationActionsSection.tsx` (horizontal category chips + amount input + save button). The screen renders:

1. A header using `t('budgets.title', locale)`.
2. `progress` mapped to a row per budget: `CategoryAvatar` (or an "Overall" pill), the label, a progress bar whose fill width is `Math.min(100, pct)%` colored `#2BD98E` (ok) / `#F5B841` (warn) / `#FF5C6C` (over), and a caption `<Money spent /> {t('budgets.spentOf')} <Money amount />`.
3. An add form: scope toggle (Overall / Category), category chips when scope is category, period toggle (Monthly / Weekly), an amount `TextInput` with `keyboardType="numeric"`, and a warn-% input defaulting to 80.
4. A delete action per row calling `deleteBudget(id)` then `refresh()`.

Every row honors `isRTL(locale)` for `flexDirection` and `textAlign`, per the Global Constraints.

- [ ] **Step 4: Register the route and the Settings entry**

In `app/_layout.tsx`, beside the existing statistics entry:

```tsx
<Stack.Screen name="budgets" options={{ presentation: 'card' }} />
```

In `app/(tabs)/settings.tsx`, add a row that navigates to it, matching the existing Statistics row's markup and using the icon `piggy-bank-outline`:

```tsx
router.push('/budgets' as Href)
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/budgets.tsx src/features/budgets/useBudgets.ts app/_layout.tsx "app/(tabs)/settings.tsx" src/lib/i18n.ts
git commit -m "feat(budgets): budgets screen with progress bars and add/edit form"
```

---

### Task 10: Dashboard summary card + notification deep link

**Files:**
- Create: `src/features/budgets/BudgetSummaryCard.tsx`
- Modify: `app/(tabs)/index.tsx` (mount the card), `src/features/notifications/useNotifications.ts` (route `/budgets`)

**Interfaces:**
- Consumes: `useBudgets` (Task 9), `atRisk` (Task 8).
- Produces: `<BudgetSummaryCard locale={locale} />`.

- [ ] **Step 1: Build the card**

Create `src/features/budgets/BudgetSummaryCard.tsx`. It calls `useBudgets()`, renders nothing when there are no budgets (so users who never set one see no clutter), and otherwise shows the overall budget's bar (if one exists) plus `atRisk(progress, 2)` rows. The whole card is a `PressableScale` that navigates to `/budgets`. Reuse the `Card` component and the same bar colors as Task 9.

- [ ] **Step 2: Mount it on the dashboard**

In `app/(tabs)/index.tsx`, render `<BudgetSummaryCard locale={locale} />` below the existing month-summary section.

- [ ] **Step 3: Confirm the notification deep link resolves**

The push sets `data.url = '/budgets'`. The existing plain-tap branch in `useNotifications.ts` already does `router.push(data.url)`, so no code change is needed — but verify by reading the handler that a non-`/(tabs)/pending` url still routes. If `router.push` is typed against known routes, cast as the file already does (`data.url as never`).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx jest`
Expected: tsc clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/budgets/BudgetSummaryCard.tsx "app/(tabs)/index.tsx"
git commit -m "feat(budgets): dashboard summary card linking to the budgets screen"
```

---

### Task 11: Weekly recap digest

**Files:**
- Modify: `supabase/functions/budget-check/index.ts`
- Test: `supabase/functions/tests/budget_check_test.ts` (append)

**Interfaces:**
- Consumes: `handleBudgetCheck` / `BudgetCheckDeps` (Task 6), `weeklyCycle` (Task 3), `BudgetProgress`-equivalent data already computed in the handler loop.
- Produces: a second push (`kind: 'recap'`) on the first run of each new week, deduped by the weekly `cycle_key`.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/tests/budget_check_test.ts`:

```typescript
// 2026-07-11 is a Saturday — the first run of a new weekly cycle.
const SATURDAY = new Date("2026-07-11T03:00:00Z");

Deno.test("recap: sends a separate digest push on Saturday", async () => {
  const bodies: string[] = [];
  await handleBudgetCheck(post(), makeDeps({
    now: () => SATURDAY,
    getCycleSpend: () => Promise.resolve({ overall: 300, byCategory: { food: 300 } }),
    sendPush: (msgs) => {
      for (const m of msgs) bodies.push(m.body);
      return Promise.resolve();
    },
  }));
  // 300/1000 triggers no threshold alert, so the ONLY push is the recap.
  assertEquals(bodies.length, 1);
  assert(bodies[0].includes("food"));
});

Deno.test("recap: not sent midweek", async () => {
  let pushed = 0;
  await handleBudgetCheck(post(), makeDeps({
    now: () => new Date("2026-07-14T03:00:00Z"), // Tuesday
    getCycleSpend: () => Promise.resolve({ overall: 300, byCategory: { food: 300 } }),
    sendPush: () => { pushed++; return Promise.resolve(); },
  }));
  assertEquals(pushed, 0);
});

Deno.test("recap: skipped when already sent for this week", async () => {
  let pushed = 0;
  await handleBudgetCheck(post(), makeDeps({
    now: () => SATURDAY,
    getCycleSpend: () => Promise.resolve({ overall: 300, byCategory: { food: 300 } }),
    listSentAlerts: () => Promise.resolve([
      { budget_id: null, kind: "recap", cycle_key: "2026-W28", category_slug: null },
    ]),
    sendPush: () => { pushed++; return Promise.resolve(); },
  }));
  assertEquals(pushed, 0);
});
```

**Note:** the expected `cycle_key` in the third test must match what `weeklyCycle(SATURDAY).key` actually returns. Compute it first — `deno eval 'import {weeklyCycle} from "./supabase/functions/_shared/budgetCycles.ts"; console.log(weeklyCycle(new Date("2026-07-11T03:00:00Z")).key)'` — and use that exact value.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/budget_check_test.ts`
Expected: FAIL — no recap push is produced.

- [ ] **Step 3: Implement the recap**

In `handleBudgetCheck`, after the existing alert push block and still inside the per-user `try`, add:

```typescript
      // --- Weekly recap: a standing digest on the first run of a new week. ---
      // Sent independently of thresholds (it is a status report, not an alarm)
      // and deduped by the weekly cycle key, so it fires once per week.
      const isWeekStart = now.getTime() - weekly.start.getTime() < 86_400_000;
      if (isWeekStart && budgets.length > 0) {
        const recapKey = dedupKey({ budgetId: null, kind: "recap", cycleKey: weekly.key, categorySlug: null });
        const alreadySent = new Set(sent.map(dedupKey)).has(recapKey);
        if (!alreadySent) {
          const lines = budgets.map((b) => {
            const set = b.period === "weekly" ? weeklySpend : monthlySpend;
            const spend = b.scope === "overall"
              ? set.overall
              : set.byCategory[b.category_slug ?? ""] ?? 0;
            const pct = b.amount > 0 ? Math.round((spend / b.amount) * 100) : 0;
            return `${b.category_slug ?? "Overall"} ${pct}%`;
          });
          await deps.recordAlerts(user.userId, [{
            user_id: user.userId,
            budget_id: null,
            kind: "recap",
            cycle_key: weekly.key,
            category_slug: null,
            meta: { lines },
          }]);
          if (tokensForRecap.length > 0) {
            await deps.sendPush(tokensForRecap.map((to) => ({
              to,
              title: "Weekly recap",
              body: lines.slice(0, 4).join(" · "),
              data: { url: "/budgets" },
            })));
          }
        }
      }
```

This needs `sent` and the push tokens available even when no threshold alert fired. Restructure the per-user body so both are fetched before the `if (fresh.length === 0) continue;` early-return:

- Move `const sent = await deps.listSentAlerts(...)` to just after `descriptors` is built, and drop the `if (descriptors.length === 0) continue;` early-return (the recap must still run when there are no alerts).
- Hoist the token fetch into `const tokensForRecap = await deps.getPushTokens(user.userId);` before the alert push, and reuse that same array for the alert push instead of re-fetching.
- Replace the `if (fresh.length === 0) continue;` with an `if (fresh.length > 0) { ...record + push... }` block so control flows on to the recap.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/`
Expected: PASS — the earlier Task 6 tests still pass (they run on a Monday-equivalent date, so no recap interferes) plus the 3 new ones.

- [ ] **Step 5: Redeploy**

Run: `supabase functions deploy budget-check --project-ref pzyadiwfjmjsafssxshc`

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/budget-check/index.ts supabase/functions/tests/budget_check_test.ts
git commit -m "feat(budgets): weekly recap digest push"
```

---

### Task 12: Ship

**Files:** none (deploy only)

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit && npx jest && cd supabase/functions && deno test --allow-all --node-modules-dir=auto tests/
```
Expected: tsc clean; all Jest suites pass; all Deno tests pass.

- [ ] **Step 2: Confirm the server side is live**

```bash
supabase db query "select jobname, active from cron.job where jobname = 'budget-check-daily';"
```
Expected: one active row. (Migration + function were deployed in Task 7.)

- [ ] **Step 3: OTA the client to production iOS**

The guard is mandatory — the local `.env` points at the LAN dev Supabase, and shipping that would break the live app.

```bash
URL=https://pzyadiwfjmjsafssxshc.supabase.co
ANON=$(node -e "console.log(require('./eas.json').build.production.env.EXPO_PUBLIC_SUPABASE_ANON_KEY)")
[ "$URL" = "https://pzyadiwfjmjsafssxshc.supabase.co" ] || { echo "BAD URL, abort"; exit 1; }
EXPO_PUBLIC_SUPABASE_URL="$URL" EXPO_PUBLIC_SUPABASE_ANON_KEY="$ANON" \
  npx eas-cli update --branch production --platform ios \
  --message "Budgets: spending caps with daily alerts and insights" --non-interactive
```
Expected: "Published!" with runtime version 1.2.0.

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A && git commit -m "chore(budgets): ship budgets and spending insights"
```

---

## Notes for the implementer

- **Push copy must be localized.** `ActiveUser.locale` is loaded for exactly this
  reason. The strings in `alertLine`, the `"Budget check"` / `"Weekly recap"`
  titles, and the `"Overall"` fallback label are user-facing, so per the Global
  Constraints they need an Arabic form. Add a small server-side lookup in
  `budget-check/index.ts` (a `Record<string, {en: string; ar: string}>` — the
  Edge Functions cannot import `src/lib/i18n.ts`) and select on `user.locale`.
  Arabic forms to use: `Budget check` → `متابعة الميزانية`, `Weekly recap` →
  `ملخص الأسبوع`, `Overall` → `الإجمالي`, `over by` → `تجاوز بمقدار`, `at 100%` →
  `وصلت 100%`, `on pace +` → `متوقع تجاوز +`, `up` → `أعلى بـ`, `x this week` →
  `مرة هذا الأسبوع`.
- **Category labels in pushes:** `alertLine` receives the raw `category_slug`
  (e.g. `food`). Pass a human label instead — the function already has the
  slug, so join against `public.categories` (`name_en` / `name_ar`) in
  `listBudgets` or a small lookup, and fall back to the slug when missing.
- **Do not add budget checks to `ingest-sms` or the in-app capture path.** Alerting is deliberately once-daily; adding point-of-spend hooks is out of scope (spec §9).
- **`budget_alerts` has no client INSERT policy** by design — only the service-role job writes it. If the client ever needs to mark an alert read, that is a new policy and a new task.
- **The unique index on `budget_alerts` is the real dedup guarantee.** The in-handler `listSentAlerts` filter is an optimization; never remove the index.
- **If `supabase db query` is unavailable** (CLI older than v2.79.0), run the verification SQL through the Supabase Studio SQL editor instead.
