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

---

## Deltas — 2026-07-03 (session refinements, still local-only)

Picked the feature back up. Confirmed **Decision A stays B-style opt-out** (new cards
auto-enable, capture immediately, user disables unwanted ones — no change to what was
built). Added three things:

### D1 — Branch sync (bring `main`'s latest ingest edits onto `feat/sms-cards`)

Cherry-picked the 4 server-side commits `main` gained since divergence
(`d097e9a` kind-classification, `2712925` bills/fines→other, `c4b51b5` space/comma
thousands separators, `b6556e1` GROQ_MODEL→`llama-4-scout`). A full `git merge` was
rejected: both branches independently carry privacy-eye + fuel-station commits, so a
merge explodes into duplicate-implementation conflicts across unrelated UI. Cherry-pick
was surgical. The **kind filter is synergistic** with capture-all: forwarding every
message floods the server with promos/OTPs/fines, and `kind:offer/other` is exactly
what stops those becoming false transactions. Merged flow order (verified):
pre-filter → LLM → **amount/kind skip** → **card find/create** → card-disabled skip →
insert. Promos/fines never even create a card.

### D2 — Hardened card-tail extraction (`extractCard`)

Every way a bank masks a number now collapses to ONE fingerprint via a shared
`fingerprintFromDigits(digits) → { fingerprint: acct:<last4>, last4 }` (last-4, zero-
padded), reused by the manual-add form so a typed card matches its messages:
- mask runs: `xxxx` / `****` / `••••` / `٭٭٭٭` / spaced full-PAN groups
- dot/dash masks: `...0328`, `----0328`, ellipsis
- keyword tails with NO mask glyph: `card ending 4321`, `رقم 8889`
- **bug fix:** a leading-zero tail (`0328`) was stored/labelled as `328`.

Precision kept: single-dash dates (`2026-07-10`), decimals (`200.00`) and reference
numbers (`رقم مرجعي 8878…`) are NOT mistaken for cards. Mirrored in both `smsDetect`
copies (Deno + RN) + tests.

### D3 — Manual card add

`addManualCard(digits, label?)` in `cards.ts` upserts on `(user_id, fingerprint)` (RLS
`insert_own` policy already exists in migration 0018) — re-adding an existing card just
refreshes its label, never duplicates, and leaves `enabled` untouched. UI: an "Add a
card" inline form in `CardsSection` (last-4 required, name optional; both platforms).
Under opt-out this is for **pre-emptive control** — pre-name a card, or add + disable a
card you don't want before its first txn captures.

### D4 — Global auto-capture toggle

`profiles.auto_capture_enabled` (migration `0019`, default true) + a master Switch in
Settings (above Cards). `ingest-sms` gates on it right after auth, **before the LLM** (a
paused user costs no Groq calls) → `{skipped, reason:'capture_off'}`. Server-side gate,
so it works on **both platforms** even though the iOS Shortcut / Android listener keep
forwarding — no native change, stays OTA-able. Fail-open if the column/row is missing.
The Android-native short-circuit (stop forwarding on-device) is **deferred** — it needs
a native rebuild of the listener, out of scope for JS-only work.

### Status

Local-only, **not pushed / not deployed**. 119 Deno + 319 Jest green; `tsc` clean.
Migration `0019` needs applying (`supabase migration up` local; prod push when shipping).
Ship split unchanged from above: server (fns + migrations) → Supabase deploy; Cards UI +
`cards.ts` + detector + settings toggle → OTA both; `androidCapture.ts` → Android-only.
