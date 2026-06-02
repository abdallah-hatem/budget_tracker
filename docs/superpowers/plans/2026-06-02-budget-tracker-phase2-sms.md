# Budget Tracker — Phase 2 (SMS Auto-Capture) Implementation Plan

> **For agentic workers:** implement task-by-task; keep `npx jest`, `npx tsc --noEmit`, and `deno test` green; commit per milestone.

**Goal:** Auto-capture bank/wallet SMS into a review queue. An iOS Shortcut POSTs the SMS text + a per-user secret token to a public `ingest-sms` Edge Function, which validates the token, runs the same Groq categorizer, and inserts a **pending** transaction the user confirms/fixes in a new **Pending inbox**.

**Architecture:** Builds on Phase 1. New: `ingest_tokens` table + `create_ingest_token`/`revoke_ingest_tokens` RPCs (migration `0002`); a `verify_jwt = false` `ingest-sms` Edge Function that authenticates via a hashed shared-secret token and writes with the service role; a Pending tab; and ingest-token management + an iOS Shortcut guide in Settings. Reuses the existing `categorize` core, `transactions` table (`status='pending'`, `source='sms'` already allowed), `listTransactions`/`updateTransaction`/`deleteTransaction`, and `EditTransactionSheet`.

**Tech stack:** unchanged — Expo SDK 54 + NativeWind + Supabase (local Docker) + Deno Edge Functions + Groq. `pgcrypto` (already in Supabase `extensions` schema) for token gen/hash.

---

## Locked contract

### DB (migration `supabase/migrations/0002_ingest_tokens.sql`)
- `create extension if not exists pgcrypto with schema extensions;`
- Table `public.ingest_tokens`:
  - `id uuid primary key default gen_random_uuid()`
  - `user_id uuid not null references auth.users(id) on delete cascade`
  - `token_hash text not null unique` — `sha256(raw_token)` hex; raw token NEVER stored
  - `label text`
  - `created_at timestamptz not null default now()`
  - `last_used_at timestamptz`
  - `revoked boolean not null default false`
  - index on `(token_hash)` (unique already) and `(user_id)`
- RLS on: select/insert/update/delete where `user_id = (select auth.uid())`. (The Edge Function uses the service role to read across users after validating the token — RLS does not block service role.)
- RPC `public.create_ingest_token()` returns `text` — `SECURITY DEFINER`, `set search_path = ''`:
  - revoke caller's existing tokens (`update public.ingest_tokens set revoked = true where user_id = auth.uid() and revoked = false`)
  - `raw := replace(replace(encode(extensions.gen_random_bytes(32), 'base64'), '+','-'), '/','_')`
  - insert `(user_id = auth.uid(), token_hash = encode(extensions.digest(raw, 'sha256'), 'hex'))`
  - `return raw` (shown to the user exactly once)
- RPC `public.revoke_ingest_tokens()` returns `void` — `SECURITY DEFINER`, `set search_path=''`: set `revoked=true` for all caller's tokens.
- Helper (used by the Edge Function): plain `select user_id from public.ingest_tokens where token_hash = $1 and revoked = false` via the service role (no RPC needed).

### Edge Function `supabase/functions/ingest-sms/index.ts` (`verify_jwt = false`)
- POST `{ text: string, token: string, received_at?: string }`.
- Reuses `../_shared/categorize.ts` (`categorize`) and `../_shared/cors.ts`.
- Flow: OPTIONS→cors; POST only (405); parse body; require `token` (401 if missing) and `text` (400 if empty); `text.length > 2000` → 413; missing `GROQ_API_KEY` → 500.
- Hash the token (`sha256` hex) and look up `user_id` via a **service-role** Supabase client (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, both auto-injected locally). No row / revoked → **401**.
- Update `last_used_at = now()` for that token.
- `categorize(text, 'en', GROQ_API_KEY)` (SMS locale defaults `en`; the model auto-detects Arabic).
- If `parsed.amount <= 0` (after rounding to 2dp) → **skip insert**, return `200 { ok: true, skipped: true }` (non-transaction SMS like OTPs). Else insert a transaction `{ user_id, type, amount, currency:'EGP', category_slug, note, raw_text:text, source:'sms', status:'pending', confidence, occurred_at: received_at-or-now }` via the service role.
- Return `200 { ok: true }`. Make the handler injectable (deps: `groqKey`, `categorizeFn`, `lookupUserId`, `insertPending`, `touchToken`) for deno tests with no network/DB.
- `config.toml`: `[functions.ingest-sms] verify_jwt = false`.
- Hash helper `supabase/functions/_shared/hash.ts`: `sha256Hex(s: string): Promise<string>` using Web Crypto (`crypto.subtle.digest('SHA-256', ...)`).

### App
- `src/features/ingest/api.ts`:
  - `createIngestToken(): Promise<string>` → `supabase.rpc('create_ingest_token')` (returns raw token once; throw on error).
  - `revokeIngestTokens(): Promise<void>` → `supabase.rpc('revoke_ingest_tokens')`.
  - `hasActiveIngestToken(): Promise<boolean>` → `supabase.from('ingest_tokens').select('id').eq('revoked', false).limit(1)` (RLS-scoped).
- `src/features/transactions/usePending.ts`: `usePending(): { data, count, loading, refresh }` → `listTransactions({ status: 'pending' })`, newest first.
- `EditTransactionSheet`: add optional prop `confirmOnSave?: boolean` — when true, the Save patch also sets `status: 'confirmed'`.
- Routes: add `app/(tabs)/pending.tsx` and a 5th tab in `app/(tabs)/_layout.tsx` (order: index, capture, **pending**, transactions, settings) with a badge = pending count.
- i18n: add keys `pending_title, pending_empty, confirm, reject, sms_capture, sms_token_intro, generate_token, regenerate_token, revoke_token, token_shown_once, copy, copied, shortcut_guide` (en + ar).

---

## Milestone P2.1 — DB: ingest_tokens + RPCs

### Task P2.1.1 — migration + apply
**Files:** Create `supabase/migrations/0002_ingest_tokens.sql`; apply with `supabase db reset` (or `supabase migration up`).
- [ ] Write the migration per the contract (table, RLS, both RPCs, pgcrypto). `grant execute on function public.create_ingest_token(), public.revoke_ingest_tokens() to authenticated;`.
- [ ] Apply and verify (via `docker exec supabase_db_budget_tracker psql -U postgres`): table exists, RLS enabled, both RPCs exist, `create extension pgcrypto` succeeded.
- [ ] Smoke the RPC in SQL impersonating a user (set `request.jwt.claim.sub` / `role authenticated`): `select public.create_ingest_token();` returns a ~43-char token; a second call revokes the first (only one `revoked=false` row remains); `token_hash` = `encode(digest(raw,'sha256'),'hex')`.
- [ ] Commit `feat(db): ingest_tokens table + create/revoke RPCs (phase 2)`.

### Task P2.1.2 — RLS isolation check for ingest_tokens
**Files:** extend `supabase/tests/rls_check.sql`.
- [ ] Add assertions: user B cannot select user A's ingest_tokens; user B insert forging user A's user_id is denied. Run it; all PASS.
- [ ] Commit `test(db): ingest_tokens RLS isolation`.

---

## Milestone P2.2 — ingest-sms Edge Function

### Task P2.2.1 — shared hash helper (TDD)
**Files:** Create `supabase/functions/_shared/hash.ts` + `supabase/functions/tests/hash_test.ts`.
- [ ] `export async function sha256Hex(input: string): Promise<string>` using Web Crypto.
- [ ] Test: known vector (`sha256('abc')` === `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`).

### Task P2.2.2 — handler (TDD, injectable deps)
**Files:** Create `supabase/functions/ingest-sms/index.ts` + `supabase/functions/tests/ingest_sms_test.ts`.
- [ ] `export interface IngestDeps { groqKey: string; categorizeFn; lookupUserId(tokenHash): Promise<string|null>; insertPending(row): Promise<void>; touchToken(tokenHash): Promise<void>; }` and `export async function handleIngest(req, deps): Promise<Response>`.
- [ ] Tests (inject fakes, no network): OPTIONS→204+cors; non-POST→405; missing token→401; empty text→400; >2000 chars→413; missing groqKey→500; unknown/revoked token (`lookupUserId`→null)→401; valid token + amount>0 → inserts pending row (assert `status:'pending'`, `source:'sms'`, `user_id` resolved) → 200 `{ok:true}`; amount<=0 → NOT inserted → 200 `{ok:true, skipped:true}`; `touchToken` called on success.
- [ ] Real runtime wiring under `import.meta.main`: build a service-role client (`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`), implement the real deps (lookup via `ingest_tokens`, insert into `transactions`, update `last_used_at`), `groqKey = Deno.env.get('GROQ_API_KEY')`.
- [ ] `config.toml`: add `[functions.ingest-sms] verify_jwt = false`.
- [ ] Run `deno test` (all green). Commit `feat(edge): ingest-sms function with token auth + pending insert`.

---

## Milestone P2.3 — App data layer

### Task P2.3.1 — ingest api + pending hook (TDD where pure)
**Files:** Create `src/features/ingest/api.ts` (+ test mocking supabase), `src/features/transactions/usePending.ts` (+ test mocking api). Modify `src/features/transactions/EditTransactionSheet.tsx` (add `confirmOnSave?` prop → adds `status:'confirmed'` to the update patch).
- [ ] Implement per contract; tests: `createIngestToken` calls `rpc('create_ingest_token')` and returns the token; `usePending` calls `listTransactions({status:'pending'})` and exposes count; EditTransactionSheet with `confirmOnSave` includes `status:'confirmed'` in the patch.
- [ ] Keep `npm test` + `tsc` green. Commit `feat: ingest token client + pending hook + confirmOnSave`.

---

## Milestone P2.4 — Pending inbox

### Task P2.4.1 — Pending screen + tab + badge
**Files:** Create `app/(tabs)/pending.tsx`; modify `app/(tabs)/_layout.tsx` (add `pending` tab with a badge = pending count via `usePending`).
- [ ] Pending screen: `usePending()` list; each row shows category label + signed amount + note + raw_text (the SMS) + a "via SMS" marker; actions **Confirm** (`updateTransaction(id,{status:'confirmed'})`→refresh), **Edit** (open `EditTransactionSheet` with `confirmOnSave`), **Reject** (`deleteTransaction`→refresh). Empty state. RTL-aware. testIDs `pending-row-<id>`, `pending-confirm-<id>`, `pending-reject-<id>`.
- [ ] Render test (mock usePending + api): rows render; Confirm calls updateTransaction with status confirmed; Reject calls deleteTransaction.
- [ ] Keep `npm test` + `tsc` green. Commit `feat: pending inbox tab with confirm/edit/reject + badge`.

---

## Milestone P2.5 — Settings: token + Shortcut guide

### Task P2.5.1 — ingest token management UI
**Files:** modify `app/(tabs)/settings.tsx`; use `expo-clipboard` (`npx expo install expo-clipboard`) for copy.
- [ ] An "SMS auto-capture" section: if no active token, a **Generate token** button (`createIngestToken` → show the raw token ONCE in a copyable box with "won't be shown again"); if active, show **Regenerate** + **Revoke**. Use i18n strings.
- [ ] A collapsible **iOS Shortcut guide**: Personal Automation → Message → "Message Contains: EGP" → Run Immediately → Get Contents of URL POST to `<EXPO_PUBLIC_SUPABASE_URL>/functions/v1/ingest-sms` with headers `Content-Type: application/json`, `apikey: <anon>`, body `{ "text": <Shortcut Input>, "token": "<paste token>" }`. Show the resolved function URL.
- [ ] Render test (mock ingest api): Generate shows the token; Revoke calls revoke. Keep `npm test` + `tsc` green. Commit `feat: ingest token settings + iOS Shortcut guide`.

---

## Milestone P2.6 — Verification

### Task P2.6.1 — full verification + live ingest
- [ ] `npm test`, `npx tsc --noEmit`, `cd supabase/functions && deno test` — all green; `npx expo lint` 0 errors.
- [ ] Serve `ingest-sms` (`supabase functions serve`), generate a token via the RPC, then `curl` the public endpoint simulating the Shortcut (token + a sample bank SMS) → assert a `pending` `sms` row appears for that user; an invalid token → 401; an OTP-style SMS (no amount) → `skipped`.
- [ ] Confirm the row shows in the Pending inbox query (`listTransactions({status:'pending'})`).
- [ ] Commit any fixes.

---

## Security notes
- `ingest-sms` is **public** (`verify_jwt=false`). It is protected by: a 32-byte random bearer token (sha256-hashed at rest, revocable), input length cap (413), and amount-guard skip. **Accepted MVP risk:** no per-token rate limit yet — a leaked token could spam pending rows for that one user (not cross-user; service-role writes are scoped to the resolved `user_id`). Follow-up: add a per-token request counter or Supabase rate limit.
- The service-role key stays server-side (Edge env), never shipped to the app.
- Raw tokens are shown once and stored only as sha256 hashes.
