# Keyword-free SMS capture + auto-detected Cards — Design

**Date:** 2026-06-29
**Branch:** `feat/android` (build + local test only; no push/OTA until approved)
**Status:** approved (A/B/C defaults accepted)

## Goal

Make bank-transaction auto-capture work **without the user configuring keywords**, and
let users **manage the cards/accounts the app auto-detects from messages** (rename,
enable, disable). Replace "manage keywords" with "manage Cards" as the primary mental
model.

## Hard constraint (drives the whole design)

Apps **cannot read the SMS inbox** on iOS (no API), and `READ_SMS` on Android is a
Play **restricted permission** that gets finance apps rejected. So the **transport is
unchanged**:

- **iOS:** user's Shortcuts automation → `Log SMS to Masareef` App Intent → `ingest-sms`.
- **Android:** `NotificationListenerService` → headless JS task → `ingest-sms`.

Only the **filtering + parsing** layers change.

## Design

### 1. Generic detection (replaces the keyword gate)

- The **server already discards non-transactions**: `ingest-sms` runs the LLM, and if no
  positive amount is found it returns `{skipped:true}` and stores nothing. That IS the
  generic detector. Keyword-free simply means we stop *requiring* a user keyword on the
  device before forwarding.
- **Android headless** (`androidCapture.ts`): when the user has **no keywords**, forward
  any notification that *looks like a transaction* via a cheap local check
  (`looksLikeTransaction`: a currency token + an amount, or a transfer verb). If keywords
  ARE set, keep the existing keyword behavior (back-compat / power users).
- **Server pre-filter** (optimization): run `looksLikeTransaction(text)` before the Groq
  call and skip obvious non-transactions, to avoid spending LLM calls on OTP/promo texts.

### 2. Card extraction (`_shared/smsDetect.ts`, deterministic regex — no LLM)

`extractCard(text) -> { fingerprint, label } | null`:

| Signal in text | fingerprint | default label |
|---|---|---|
| masked number `…رقم xxx8889`, `****8889`, `account …8889` | `acct:8889` | `•••• 8889` |
| `بطاقتكم مسبقة الدفع` / `prepaid card` | `prepaid` | `Prepaid card` |
| `حساب رقم` (no digits) | `account` | `Account` |
| none of the above | `null` → bucket under `Unknown card` (fingerprint `unknown`) | `Unknown card` |

Fingerprint is the stable per-user key. (Bank name from sender/app is a v2 enrichment.)

### 3. Data model — migration `0018_detected_cards.sql`

```sql
create table public.detected_cards (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  fingerprint  text not null,
  label        text,
  enabled      boolean not null default true,   -- Decision A: auto-enabled
  last_seen_at timestamptz,
  txn_count    integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, fingerprint)
);
alter table public.transactions
  add column card_id uuid references public.detected_cards(id) on delete set null;
```
RLS: owner (`auth.uid() = user_id`) may select/update/delete their cards. Inserts/updates
from `ingest-sms` use the service-role client (bypasses RLS), same as transactions today.

### 4. `ingest-sms` flow change

After a positive-amount parse, before insert:
1. `extractCard(text)` → fingerprint/label (default `unknown`/`Unknown card`).
2. `findOrCreateCard(userId, fingerprint, label)` → `{ id, enabled, isNew }`; bump
   `txn_count`, set `last_seen_at`.
3. If `!enabled` → return `{ ok:true, skipped:true, reason:'card_disabled' }` (store nothing).
4. Else insert pending tagged with `card_id`.
5. If `isNew` → in the best-effort push block, send a **"New card detected: <label> —
   tap to manage"** notification (deep-link to the Cards section) instead of/in addition
   to the normal one.

### 5. Client + UI

- `src/features/ingest/cards.ts`: `listDetectedCards()`, `setCardEnabled(id, bool)`,
  `renameCard(id, label)`, `deleteCard(id)` (all RLS-scoped to the user).
- `src/features/ingest/CardsSection.tsx`: a `CollapsibleCard` listing detected cards —
  label, masked number, **enable/disable** toggle, txn count, last seen; tap to
  rename/delete. Shown on **both platforms** (it reflects server-detected cards).
- `settings.tsx`: render `<CardsSection>` above the capture sections. Keyword input in
  `AndroidCaptureSection` becomes optional ("Advanced — only forward messages containing
  these words"); `SmsRulesSection` stays as-is.

### 6. Platform specifics

- **Android:** `androidCapture.ts` no longer early-returns on empty keywords; uses
  `looksLikeTransaction` when no keywords. (JS, stays on `feat/android`.)
- **iOS:** onboarding/settings copy updated to recommend a **sender-based** automation
  ("forward messages from your bank") rather than a keyword "Message Contains". Copy-only
  (JS). Server filters. (Reaches iOS via `main` later.)

### 7. Privacy

Less on-device filtering ⇒ more non-transaction texts may reach the server. The server
**detects-and-discards immediately and never stores non-transactions** (existing
behavior + the new pre-filter). Update `privacy.html` + Play Data Safety to state
messages are forwarded and filtered server-side.

## Decisions

- **A:** New cards **auto-enabled**, with a one-time "new card detected" push. ✅
- **B:** Cards are standalone SMS-grouping metadata in v1 — **not** linked to balance
  `accounts`. Account-linking is v2. ✅
- **C:** iOS goes keyword-free via a **sender-based** Shortcut (copy change). ✅

## Testing (local only)

- Unit: `smsDetect` against the real sample texts (with/without card number, Arabic).
- `ingest-sms`: card find/create, disabled-card skip, card_id tagging, new-card push.
- Client/UI: list/toggle/rename/delete.
- Manual: local Supabase + simulator; POST sample texts to local `ingest-sms`; verify
  cards appear, disable suppresses, pending tagged. **No prod deploy / OTA.**

## Branch/push hygiene (for when we ship — not now)

- Server (migration, function, `_shared`) → deploy to Supabase, platform-agnostic.
- Cards UI + `cards.ts` + detector → JS, OTA to both (iOS via `main`, Android via `feat/android`).
- `androidCapture.ts` change → Android-only, **never** cherry-picked to `main`.
- iOS onboarding copy → iOS via `main`.
