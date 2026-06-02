# Budget Tracker — Design Spec

**Date:** 2026-06-02
**Status:** Approved for planning
**Author:** Brainstorm session (Claude + user)

## 1. Summary

A bilingual (Arabic / English) mobile budget tracker. The user logs income and
expenses by **speaking or typing** a natural sentence (e.g. *"اشتريت قهوة بـ ٥٠
جنيه"* or *"spent 50 EGP on coffee"*). The app sends the text to Claude, which
extracts `{ type, amount, currency, category, note }` and assigns it to one of a
**fixed, pre-built category set**. Bank/wallet **SMS messages are auto-captured**
via an iOS Shortcuts automation that POSTs the message to the backend, where
Claude parses it the same way. All auto-parsed entries land in a **review queue**
("Pending") that the user confirms or corrects before they count.

This is the **MVP**: tracking only (no budget limits yet), **EGP only**, public
product on Supabase.

## 2. Goals & Non-Goals

### Goals (MVP)
- Email auth (public product, multi-user).
- Capture an expense/income by **voice or text**, in Arabic or English, and have
  Claude categorize it.
- Auto-ingest **bank SMS** via an iOS Shortcut → review queue.
- A **Pending inbox** to confirm/fix auto-parsed entries before they commit.
- A **dashboard**: month totals, income vs. expense, breakdown by category, recent
  transactions.
- A **transactions list**: filter by month/category, edit, delete.
- Strict data isolation between users (Row-Level Security).

### Non-Goals (explicitly deferred)
- Budget **limits / caps / alerts** → Phase 3.
- **Multi-currency** + exchange rates → Phase 3 (schema stores `currency` now so we
  can expand without migration pain).
- User-defined custom categories (categories are pre-built by us).
- Android Shortcut equivalent for SMS (iOS-first; Android can use a Tasker/HTTP
  recipe later — out of scope for MVP).
- Web app (Expo is configured for native; web is not a target).

## 3. Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Audience | Public product, Supabase backend |
| Categorizer | **Claude (LLM)** via Supabase Edge Function |
| Manual input | **Voice + text**, both |
| SMS capture | iOS **Shortcuts automation** → Edge Function |
| Confirm flow | **Review before commit** — SMS via the async **Pending inbox**; in-app voice/text via an **inline confirm sheet** (both let the user confirm/fix Claude's guess before it counts) |
| Budgets | **Track only** for MVP; limits deferred |
| Currency | **EGP only** for MVP |
| Shortcut auth | **Per-user ingest token** (generated in app, pasted into Shortcut once) |
| Local dev | **Local Supabase in Docker** via the Supabase CLI |

## 4. Tech Stack (verified 2026-06-02)

| Concern | Choice | Notes |
|---|---|---|
| App framework | **Expo SDK 54** (React Native), Expo Router | Dev build required (see below) |
| Styling | **NativeWind v4.2.1** + **Tailwind CSS v3.4.17** | NativeWind v5 / Tailwind v4 still unstable — do **not** use |
| Speech-to-text | **`expo-speech-recognition`** (jamsch) | Needs native build; `@react-native-voice/voice` is deprecated |
| Backend | **Supabase** — Postgres + Auth + RLS + Edge Functions (Deno) | Local stack via `supabase` CLI + Docker |
| LLM | **Claude `claude-haiku-4-5`** via `@anthropic-ai/sdk` (Deno `npm:` import, version-pinned) | Cheap, fast classification; bare alias (no date suffix) |
| Client data | `@supabase/supabase-js` + `AsyncStorage`/`SecureStore` session | RLS-protected publishable key shipped in app |

### Hard constraint: development build (no Expo Go)
`expo-speech-recognition` ships native code via a config plugin, so the app **will
not run in Expo Go**. We use a **development build** (`npx expo run:ios` / EAS dev
build). NativeWind itself is build-time only, but the STT dependency forces a dev
build anyway, so Expo Go is off the table from day one.

## 5. Architecture

```
┌─────────────────────────────┐
│  Expo app (NativeWind)      │
│   • voice (expo-speech-rec) │
│   • text box                │── supabase-js (CRUD, RLS-guarded) ──┐
│   • dashboard + pending     │                                     │
└──────────────┬──────────────┘                                     ▼
               │ functions.invoke('categorize', {body})    ┌──────────────────────────┐
               ▼  (user JWT, verify_jwt = true)             │  Supabase                 │
        ┌──────────────────┐                                │   • Auth (email)          │
        │ Edge: categorize │── calls Claude (Haiku) ───────▶│   • Postgres + RLS        │
        └──────────────────┘   writes pending/confirmed     │   • transactions          │
        ┌──────────────────┐                                │   • categories (seed)     │
        │ Edge: ingest-sms │── calls Claude (Haiku) ───────▶│   • ingest_tokens         │
        └────────▲─────────┘   writes *pending*             │   • profiles              │
                 │  (shared-secret token, verify_jwt=false) └──────────────────────────┘
                 │ POST { text, token }
        ┌────────┴─────────┐
        │  iOS Shortcut    │  "When message contains EGP → Run Immediately → POST"
        └──────────────────┘
```

### Component responsibilities
- **Expo app** — UI, auth, voice/text capture, reads/writes transactions directly to
  Supabase through `supabase-js` (RLS guarantees per-user isolation). Calls the
  `categorize` Edge Function for parsing.
- **`categorize` Edge Function** (`verify_jwt = true`) — receives `{ text, locale }`
  from an **authenticated** app user (JWT auto-attached by `functions.invoke`), calls
  Claude, returns the structured parse. Used by in-app voice/text capture.
- **`ingest-sms` Edge Function** (`verify_jwt = false`) — public endpoint hit by the
  iOS Shortcut. Validates the **per-user ingest token** (shared secret) → resolves
  `user_id` → calls Claude → inserts a **pending** transaction using the service role.
- **Shared `categorize` core** — one module both functions import: takes text + the
  category list, calls Claude with strict tool-use, returns
  `{ type, amount, currency, category_slug, note, confidence, occurred_at? }`.

### Why Edge Functions (rejected alternative)
Calling Claude directly from the app would expose the Anthropic API key in the app
bundle. The key lives **only** in Edge Function secrets.

## 6. Data Model (Postgres)

### `categories` — global, seeded by us (read-only to users, bilingual)
| field | type | notes |
|---|---|---|
| `slug` | text PK | stable id, e.g. `food`, `transport` |
| `name_en` | text | "Food & Drink" |
| `name_ar` | text | "طعام وشراب" |
| `kind` | text | `expense` \| `income` |
| `icon` | text | icon name for UI |
| `color` | text | hex/theme token |
| `sort_order` | int | display order |

**Starter set** — *Expense:* `food` (Food & Drink), `groceries`, `transport`
(Transport/Car), `clothes`, `bills` (Bills & Utilities), `health`,
`entertainment`, `education`, `home`, `travel`, `shopping`, `other_expense`.
*Income:* `salary`, `transfer_in`, `gift`, `refund`, `other_income`.

### `transactions` — per-user, core table
| field | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → auth.users; RLS key |
| `type` | text | `expense` \| `income` |
| `amount` | numeric(14,2) | EGP, > 0 |
| `currency` | text | `EGP` (fixed now; stored for future) |
| `category_slug` | text | FK → categories.slug |
| `note` | text | short label Claude extracts ("coffee") |
| `raw_text` | text | original voice/SMS/typed text (audit + re-categorize) |
| `source` | text | `voice` \| `text` \| `sms` |
| `status` | text | `pending` \| `confirmed` |
| `confidence` | numeric(3,2) | 0–1 from Claude |
| `occurred_at` | timestamptz | when it happened (default now; Claude may override) |
| `created_at` | timestamptz | insert time, default now |

### `ingest_tokens` — per-user (authenticates the Shortcut)
| field | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid | FK → auth.users |
| `token_hash` | text | SHA-256 of the secret (raw token shown once in app) |
| `created_at` | timestamptz | |
| `last_used_at` | timestamptz | |
| `revoked` | bool | default false |

A server-side RPC/Edge Function `create_ingest_token` generates a random secret,
stores only `SHA-256(token + pepper)`, and returns the **raw token once** to the
app (shown once, copyable). The user can **regenerate** (revokes old, issues new)
or **revoke** from Settings.

### `profiles` — per-user
| field | type | notes |
|---|---|---|
| `id` | uuid PK | = auth.uid() |
| `display_name` | text | |
| `locale` | text | `ar` \| `en` (drives UI language + STT locale default) |
| `currency` | text | `EGP` now |
| `created_at` | timestamptz | |

### Row-Level Security
- `transactions`, `ingest_tokens`, `profiles`: policies restrict all of
  `select/insert/update/delete` to `user_id = (select auth.uid())`.
- `categories`: `select` allowed to `authenticated` (and `anon`); no write policies.
- `ingest-sms` uses the **service role** (bypasses RLS) but only *after* validating
  the token and resolving the owning `user_id`, and inserts with that `user_id`.
- All schema + policies live in `supabase/migrations/` and apply on `db reset`.

## 7. Categorization Pipeline

1. App (or Shortcut) provides raw text + locale hint.
2. Edge Function builds a Claude **Messages** request:
   - Model: `claude-haiku-4-5`, `max_tokens: 256`.
   - System prompt: "You categorize a personal-finance utterance/SMS into a fixed
     category. Output via the `record_transaction` tool only."
   - **Strict tool use**: a single tool `record_transaction` whose `input_schema`
     has `category_slug` as an **`enum`** of our slugs, plus `type` (enum
     expense/income), `amount` (number), `currency` (default EGP), `note` (string),
     `confidence` (number 0–1), optional `occurred_at` (ISO date). `strict: true`,
     `additionalProperties: false`, forced via
     `tool_choice: { type: "tool", name: "record_transaction" }`.
3. Parse `tool_use.input` (never string-match the serialized JSON).
4. Map to a `transactions` row.
   - **In-app capture** (`categorize`): returned to the app, shown on a confirm
     screen; on Save → `status = confirmed`. (User is present → synchronous confirm.)
   - **SMS** (`ingest-sms`): inserted with `status = pending` → appears in the
     Pending inbox for async review.
5. Ambiguous/unknown → `category_slug = other_expense`/`other_income`, low
   `confidence`. Currency tokens like "EGP/جنيه/ج.م" map to `EGP`.

### Error handling
- Claude returns no usable amount → still create a `pending` row with `amount = 0`,
  `confidence = 0`, flagged for the user to fix (never silently drop an SMS).
- Edge Function failures return JSON `{ error }` with proper status codes; the app
  surfaces a retry. SMS ingest failures return non-200 so the Shortcut can be seen as
  failed (note: Shortcuts has no auto-retry — accepted limitation).
- Guard missing `ANTHROPIC_API_KEY` (→ 500), missing/invalid token (→ 401),
  oversized input (→ 413, cap `raw_text` length), and rate-limit the public
  `ingest-sms` endpoint per token.

## 8. Speech-to-Text (voice capture)

- Library: **`expo-speech-recognition`** (config plugin; dev build).
- Locale from `profiles.locale` (default) with an in-UI toggle: `ar-EG` / `ar-SA` /
  `en-US`.
- **Strategy:** attempt **on-device** first when the locale is installed
  (`getSupportedLocales()` / `supportsOnDeviceRecognition()`); otherwise fall back to
  **cloud** recognition. Arabic on-device is **not guaranteed** on all devices —
  always check at runtime and `try/catch` with cloud fallback.
- Permissions: `NSSpeechRecognitionUsageDescription`,
  `NSMicrophoneUsageDescription` (iOS), `RECORD_AUDIO` (Android) — injected by the
  config plugin.
- **Privacy note:** cloud recognition sends audio to Apple/Google (same as keyboard
  dictation). Acceptable for MVP; documented in the app's privacy copy.
- Flow: mic button → live interim transcript → final text drops into the same text
  box → user can edit → "Categorize" → confirm screen.

## 9. iOS SMS Ingestion (Shortcut)

**Verified achievable on iOS 17/18/26.** One-time user setup (guided in Settings):

1. Shortcuts → Automation → **Create Personal Automation → Message**.
2. Trigger: **"Message Contains" = `EGP`** (optionally also a Sender filter).
3. Set **"Run Immediately"** (no tap needed; an info banner still shows each fire).
4. Action: **Get Contents of URL** →
   - URL: `<SUPABASE_URL>/functions/v1/ingest-sms`
   - Method: **POST**
   - Headers: `Authorization: Bearer <ingest_token>`, `Content-Type: application/json`,
     `apikey: <publishable_key>`
   - Request Body (JSON): `{ "text": <Shortcut Input>, "received_at": <Current Date> }`
     (use *Get Text from Input* if needed to coerce the message to a string).

**Known limitations (documented for the user):**
- A notification **banner always appears** when the automation runs (cannot be fully
  silent).
- Delivery is **best-effort** — can be delayed/skipped when the device is locked or
  in Low Power Mode; no built-in retry.
- Native JSON body supports a top-level object only (fine — our payload is flat).

## 10. App Screens (Expo Router + NativeWind)

1. **Auth** — Supabase email sign-in/up (social later).
2. **Home / Dashboard** — month total, income vs expense, category breakdown
   (bar/donut), recent transactions, Pending badge.
3. **Capture** — large mic button (voice) + text box; shows Claude's parse on a
   confirm sheet (editable type/amount/category/note) before Save.
4. **Pending inbox** — list of `status = pending` rows (mostly SMS) with Claude's
   guess; per-row Confirm / Edit / Delete; badge count.
5. **Transactions** — list filterable by month + category; edit/delete; bilingual
   category labels.
6. **Settings** — language (ar/en), **ingest token** (copy / regenerate / revoke),
   step-by-step **Shortcut setup guide**, sign out.

Bilingual UI: labels resolve from `name_en`/`name_ar` by `profiles.locale`; RTL
layout when Arabic.

## 11. Local Development (Supabase + Docker)

- `supabase init` → `supabase start` (Postgres, Auth, Studio, Edge Runtime, Kong,
  Mailpit, etc. on `127.0.0.1:54321+`).
- Schema + RLS + seed: timestamped files in `supabase/migrations/`, data in
  `supabase/seed.sql`; apply with `supabase db reset`.
- Edge Functions: `supabase functions serve`; local secrets in
  **`supabase/functions/.env`** (`ANTHROPIC_API_KEY`, the shared-secret pepper for
  token hashing). Production secrets via `supabase secrets set` (separate mechanism).
- **Device connectivity:** a physical iPhone must use the **Mac's LAN IP**
  (`http://192.168.x.x:54321`), not `localhost` (simulator can use `127.0.0.1`).
  Same Wi-Fi; allow the port through the macOS firewall.
- **ATS:** local Supabase is plain HTTP — add an App Transport Security exception for
  the LAN host in the dev build, or use a tunnel (ngrok/Cloudflare) for HTTPS.
- Keys: use the 2026 **publishable** key in the app (RLS-protected); never ship the
  secret/service-role key. Env via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_*`.

## 12. Testing Strategy

- **Edge Functions** (Deno test): categorization mapping with mocked Claude
  responses — correct slug enum handling, missing-amount fallback, token
  validation (valid/invalid/revoked), oversized input, currency normalization.
- **Claude contract**: a small fixture set of Arabic + English utterances/SMS with
  expected `{type, category_slug, amount}` run against the real model in a
  manual/CI-gated suite (not on every push, to control cost).
- **Client**: unit-test the parse→row mapping, the pending-confirm reducer, and
  category label/RTL resolution. Component tests for Capture and Pending flows.
- **RLS**: integration test that user A cannot read/write user B's transactions or
  tokens.
- **Manual**: end-to-end SMS automation on a real iPhone against the local stack via
  LAN IP.

## 13. Phasing

- **Phase 1 (MVP):** auth, profiles, categories seed, in-app voice+text capture →
  `categorize` → confirm → save, dashboard, transactions list. EGP, track-only.
- **Phase 2:** ingest tokens + `ingest-sms` function + iOS Shortcut setup guide +
  Pending inbox.
- **Phase 3:** budget limits + alerts, multi-currency + rates, social login,
  Android SMS path.

## 14. Open Risks

- **On-device Arabic STT availability** varies by device — cloud fallback mandatory;
  worst case the user types. Mitigated by always offering the text box.
- **Shortcut reliability** across iOS point releases (e.g. the iOS 18.2 confirmation
  regression was HomeKit-specific, but verify on the target build). Mitigated: the
  Pending inbox + manual capture mean a missed SMS is never lost data, just
  re-enterable.
- **Public `ingest-sms` endpoint** abuse — mitigated by token validation, per-token
  rate limiting, and input-length caps.
- **LLM mis-categorization** — mitigated by the review queue and easy edit.
