# Budgets & Spending Insights — Design

**Date:** 2026-07-27
**Goal:** Help the owner reduce spending in specific categories and overall, via
per-category/overall caps with proactive alerts, plus pattern-based insight
nudges for categories with no cap set.

## 1. Summary

Add **budgets** (monthly and optionally weekly caps, per category or overall) and a
once-daily server job that evaluates them and pushes at most one concise
notification per user per day. The job also detects **spending anomalies** in
*unbudgeted* categories (spikes and unusual frequency) so the user discovers
where a budget is worth setting.

Chosen over real-time (point-of-spend) alerting: a single daily job avoids
instrumenting both capture paths (`ingest-sms` server + in-app capture), and for
monthly caps a daily nudge is timely enough.

## 2. Data model

One migration adding two tables. Both are user-owned; RLS mirrors the existing
per-user pattern (`to authenticated using ((select auth.uid()) = user_id)`, and
UPDATE policies carry both `using` and `with check`).

### `budgets`
| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `user_id` | uuid → auth.users | cascade delete |
| `scope` | text | `'overall' \| 'category'` |
| `category_slug` | text null | null when scope = `'overall'`; FK → `categories.slug` otherwise |
| `period` | text | `'monthly' \| 'weekly'` |
| `amount` | numeric(12,2) | the cap, EGP; `> 0` |
| `warn_pct` | int | default 80; warning threshold |
| `created_at` / `updated_at` | timestamptz | |

Constraints: `check (scope = 'overall') = (category_slug is null)`;
unique `(user_id, scope, coalesce(category_slug,''), period)` so a category can
hold at most one monthly and one weekly budget.

### `budget_alerts` — the dedup ledger
| column | type | notes |
| --- | --- | --- |
| `id` | uuid pk | |
| `user_id` | uuid → auth.users | cascade delete |
| `budget_id` | uuid null → budgets | null for insight rows |
| `kind` | text | `approaching \| reached \| exceeded \| pace \| recap \| insight_spike \| insight_frequency` |
| `cycle_key` | text | `'2026-07'` (monthly) or `'2026-W30'` (weekly) |
| `category_slug` | text null | for insight rows |
| `meta` | jsonb | pct, projected total, comparison figures |
| `sent_at` | timestamptz | default now() |

Unique `(user_id, coalesce(budget_id::text,''), kind, cycle_key,
coalesce(category_slug,''))` — this is what guarantees each alert fires once per
cycle. Deleting a budget cascades its alert rows.

## 3. Cycles

- **Monthly** — the user's configured custom month-start day → the next
  month-start (the app already stores and applies this; reuse that logic).
- **Weekly** — calendar week starting **Saturday** (Egypt norm). Not configurable
  in v1.
- **Spend** = `confirmed` transactions of type `expense` whose `occurred_at`
  falls in the current cycle, grouped by `category_slug` (and summed for
  overall). Pending transactions are excluded — they are not yet real spend.

## 4. Daily job — `budget-check` Edge Function

Scheduled by **pg_cron + pg_net** (the documented Supabase pattern; pg_cron is
enabled by default). The scheduling migration wraps each step in an exception-safe
`do $$ ... exception when others then null; end $$` block, matching the existing
convention in `0013_purge_raw_text.sql`, so the migration never fails in an
environment lacking the extension.

Runs once daily (03:00 UTC). For each user holding ≥1 budget **or** ≥1 category
with enough history for insights:

1. Resolve the current monthly + weekly cycle bounds.
2. Aggregate cycle spend per category and overall.
3. Evaluate each budget, in priority order — only the highest-severity state per
   budget is emitted:
   - **exceeded** — spend > cap
   - **reached** — spend ≥ cap
   - **approaching** — spend ≥ `warn_pct`% of cap, < 100%
   - **pace** — not yet over, but `projected = spend / elapsedFraction` exceeds
     the cap → "on pace to finish ~E£X over". Only emitted when the cycle is
     ≥25% elapsed (early-cycle projections are noise).
4. Evaluate insights across **all** categories, budgeted or not (§5).
5. **Weekly recap** — on the first run of each new week (Saturday, matching the
   weekly cycle start), a digest of every budget's standing. Not configurable in
   v1; deduped by the `'YYYY-Www'` cycle key like everything else.
6. Filter everything against `budget_alerts`; insert rows for what survives.
7. **Collapse into at most one push per user per day** (the weekly recap is its
   own separate push). Body lists the top few items, e.g.
   `Food 90% · Transport on pace +E£300`. Deep-links to the Budgets screen.

Reuses the existing Expo push infrastructure (push-token table + send helper from
`ingest-sms`).

## 5. Insights — watch everything

For every category with sufficient history, computed in the same job:

- **Spike** — cycle-to-date spend vs the category's trailing 3-month average,
  prorated by elapsed cycle fraction. Fires at ≥ +40% *and* above a small EGP
  floor (suppresses noise on tiny categories).
- **Frequency** — this week's transaction count vs the category's typical weekly
  count; fires on a comparable relative jump.

At most the top 1–2 insights per day, deduped per `(category, kind, cycle)`, and
folded into the same single daily push.

## 6. Client UI (all JS → OTA-able)

### Budgets screen
Opened from Settings (same pattern as Statistics; a `CollapsibleCard` row with a
`piggy-bank-outline` icon). Contents:
- Overall budget first, then per-category, each a progress bar showing
  spent / cap, percentage, and remaining. Colors: green < 80%, amber 80–99%,
  red ≥ 100%. A pace hint sits under the bar when projection exceeds the cap.
- A category with both monthly and weekly caps shows both bars.
- Add/edit form: scope (overall/category), period (monthly/weekly), amount,
  warn %. Delete per budget.
- An **Insights** section listing the current nudges.

### Dashboard summary card
A compact card on the dashboard: overall this-cycle progress plus the 2–3
most at-risk categories. Tapping it opens the Budgets screen. This is the
glanceable, behavior-changing surface — the user sees it on every app open.

### Notification handling
Budget pushes carry `data.url` pointing at the Budgets screen and reuse the
existing notification-tap routing in `useNotifications`. **No new notification
category or action buttons** are introduced, so nothing here requires a native
rebuild.

Strings are added to `src/lib/i18n.ts` with both `en` and `ar`, and all layouts
honor RTL, per existing convention.

## 7. Testing

- **Deno (`supabase/functions/tests/`)** — cycle-bound math (including custom
  month-start and Saturday weeks), spend aggregation, each threshold branch,
  pace projection with the 25%-elapsed guard, spike/frequency detection, dedup
  behavior, and the one-push-per-day collapsing. The handler takes injectable
  deps (matching `ingest-sms`) so tests need no network or DB.
- **Jest (client)** — budget CRUD api, progress/percentage/color helpers, the
  dashboard at-risk selector, and Budgets screen rendering.

## 8. Rollout

Server: one migration (tables + RLS + cron schedule) + `supabase functions
deploy budget-check`. Client: OTA to iOS from `main` — no native change, so no
rebuild and no store submission.

Phased so value lands early:

- **Phase 1** — `budgets` + `budget_alerts` tables, threshold alerts
  (approaching / reached / exceeded), Budgets screen, dashboard card.
- **Phase 2** — pace projection + weekly recap.
- **Phase 3** — watch-everything insights (spike + frequency).

## 9. Out of scope (v1)

- Real-time point-of-spend alerts (revisit if the daily nudge proves too slow).
- Configurable week-start day; rollover of unused budget between cycles;
  shared/household budgets; per-account budgets.
