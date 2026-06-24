# Gold assets — design

Track physical **gold holdings** as an asset, valued at the **live local Egyptian
price**, and surface them as part of **net worth**. No buy/sell history — just
current holdings and their value.

## Decisions (from brainstorming)
- **Purpose:** current holdings + value (not a transaction log).
- **Valuation:** live gold price, auto.
- **Price basis:** local Egyptian price (per gram, by karat, EGP) — **scraped**
  from a public page (no clean official API).
- **Holdings model:** rows of grams by karat. Karats: **24 / 21 / 18** (extensible).
- **Placement:** Accounts screen, as net worth = cash accounts + gold.
- **Approach A:** dedicated gold tables + a cached price scraper (keeps the
  transaction-based accounts model untouched).

## Data model (2 new tables)
**`gold_holdings`** (RLS owner-only, mirrors `accounts` policies):
- `id` uuid pk, `user_id` uuid → auth.users (on delete cascade)
- `karat` smallint check (in 24/21/18)
- `grams` numeric(10,3) check (> 0)
- `label` text null
- `created_at`, `updated_at` timestamptz

**`gold_prices`** (server cache, service-role only — RLS on, no policies):
- per-gram EGP per karat (`price_24`, `price_21`, `price_18` numeric)
- `source` text, `fetched_at` timestamptz
- single row (id text pk default 'egypt')

## `gold-price` edge function (verify_jwt = true)
- On call: read `gold_prices`; if `fetched_at` < 1h old → return cached. Else
  scrape the source page, parse per-gram EGP for 24/21/18k, upsert cache, return.
- Returns `{ prices: {24,21,18}, fetched_at, stale }`. Scrape failure → return
  last-known (`stale: true`); never throws to the client.
- Injectable deps (`fetchSource`, `readCache`, `writeCache`) so the **HTML parser**
  is unit-tested against a saved fixture, and the 1h cache logic is tested.

## App layer
- `useGoldHoldings()` — list/add/update/delete (like the accounts hooks).
- `useGoldPrice()` — calls the function, caches in-app, exposes `prices`,
  `fetchedAt`, `stale`.
- Pure valuation (`src/features/gold/value.ts`, unit-tested):
  - `holdingValue(grams, karat, prices)`, `goldTotal(holdings, prices)`,
    `netWorth(accountsTotal, goldTotal)`.

## UI (Accounts screen)
- Header: **Net worth** = cash total + gold total.
- **Gold** card: total grams + current EGP value + "as of HH:MM" (+ "outdated"
  if stale). Tap → manage holdings sheet: karat picker + grams + optional label;
  add / edit / delete. Bilingual + RTL.

## Errors / edge cases
- Scrape fails, cache exists → show last-known price flagged stale.
- No price ever → show grams, "value unavailable".
- Holdings UI always works regardless of price availability.

## Testing
- Edge fn: parser fixture test + cache-TTL/stale logic (injectable deps).
- App: valuation/net-worth pure-function tests.

## Shipping (no native module → OTA-able)
Develop on `feat/gold-assets`. To ship: prod DB migration (show + ask) + deploy
`gold-price` + merge to `main` + OTA to 1.1.1. **Test locally first.**
