@AGENTS.md

## Workflow

- I do NOT need to review your implementation plan. After you write the plan,
  go straight to implementing it — don't pause to ask for plan approval.
- When I ask for something, do the analysis/planning and then IMMEDIATELY
  implement it. Do NOT stop to ask "want me to?" or for confirmation before
  building what I asked for — just build it (it's git-reversible). Default to
  action, not a confirmation prompt.

## Production database — ALWAYS ask before pushing

- BEFORE any production DB migration (`supabase db push`, schema/data changes to
  the prod project `pzyadiwfjmjsafssxshc`), STOP and ask me for explicit
  confirmation — even though my Workflow rule says default to action, prod DB
  pushes are the exception. Show me the migration first.
- Once I confirm, push with the linked project: `db push` does NOT take
  `--project-ref`; it uses the linked project. Use
  `SUPABASE_DB_PASSWORD=<db-pass> supabase db push --yes`. Migrations live in
  `supabase/migrations/`; only un-applied ones run. The DB password is the one
  from `eas.json`/secure notes (never commit it).
- Adding a category needs a row in the `categories` table (the
  `transactions.category_slug` FK requires it) — ship an idempotent
  `insert … on conflict do update` migration, AND keep `src/lib/categories.ts`,
  `src/lib/categoryStyle.ts`, `supabase/seed.sql`, and
  `supabase/functions/_shared/categories.ts` in sync (the seedParity / shared
  tests enforce this), then redeploy `categorize`/`transcribe`.

## Branch policy — keep `main` OTA-shippable

- **`main` must stay OTA-shippable: only JS / OTA-able features merge to it.** Any
  feature that needs a NATIVE rebuild (a new native module, a config-plugin /
  app.json native change, a new entitlement, etc.) goes on its OWN branch
  (`feat/<name>`) and is NOT merged to `main` until we actually cut a build.
- WHY: we ship features to live users via FREE OTA off `main`. If `main` carries
  native code that isn't in the currently-shipped binary, OTA-ing `main` pushes JS
  that references missing native modules → broken/crashing app for live users.
- So: native/build features (e.g. quick-actions, RevenueCat, Google sign-in) live
  on separate branches; merge them only as part of preparing a native build, then
  bump the version. JS-only fixes (logic, UI, strings, prompts) go straight to
  `main` and OTA out.
- Quick test before merging to `main`: "could this be served as an OTA to the
  current production build without a rebuild?" If no → separate branch.

## OTA updates (EAS Update) — gotchas

- `eas update` inlines `EXPO_PUBLIC_*` from the LOCAL `.env`, which points at the
  LOCAL Supabase (`192.168.x`). ALWAYS override with the PRODUCTION values inline
  so the OTA doesn't break the live app — use the URL + anon key from
  `eas.json` → `build.production.env`:
  `EXPO_PUBLIC_SUPABASE_URL=https://pzyadiwfjmjsafssxshc.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon> npx eas-cli update --branch <production|preview> --platform ios --message "..." --non-interactive`
- Publish with `--platform ios` — the web/SSR export fails with
  `ReferenceError: window is not defined`, which aborts an all-platform update.
- `--branch` accepts a single value — publish to each branch separately.
  Channels map 1:1 to same-name branches (`production`, `preview`).

## Rotating the Groq key (server-side only — never in the app)

The `GROQ_API_KEY` lives ONLY server-side, used by the `categorize`, `transcribe`,
and `ingest-sms` Edge Functions. Changing it needs **no app rebuild / OTA / store
update** — clients never see it.

- **Production:** `supabase secrets set GROQ_API_KEY=<new> --project-ref pzyadiwfjmjsafssxshc`
  — applies on the next function invocation (functions read `Deno.env.get` at
  runtime; no redeploy required). Verify with
  `supabase secrets list --project-ref pzyadiwfjmjsafssxshc` (digest changes).
- **Local dev:** edit `supabase/functions/.env` (gitignored) → `GROQ_API_KEY=<new>`,
  then restart `supabase functions serve`.

## iOS home-screen widget (NOT OTA-able)

The medium widget (`targets/widget/index.swift`, via `@bacons/apple-targets`)
shows this-month spend + today + top categories and has mic/type quick-add
buttons. It is a **native target**, so changes ship only via a fresh **EAS
build** — never via `eas update`/OTA.

- **Data flow:** the app writes a pre-formatted snapshot to the App Group
  `group.com.abdallah.masareef` (`src/features/widget/sync.ts` →
  `ExtensionStorage`), driven by `useWidgetSync()` in `app/(tabs)/_layout.tsx`;
  the widget reads `UserDefaults(suiteName:)`. The shape lives in
  `src/features/widget/snapshot.ts` and is mirrored by `WSnapshot` in the Swift —
  **keep them in sync**.
- **Quick-add deep links:** `masareef://capture?mode=voice|type|manual` →
  `app/capture.tsx` fires the capture action then redirects to the dashboard.
- **First EAS build needs Apple setup:** the widget gets its own App ID
  (`com.abdallah.masareef.widget`); the App Group capability must be enabled on
  BOTH `com.abdallah.masareef` and the widget App ID. EAS managed credentials
  usually create/sync this during `eas build -p ios --profile preview` (it may
  prompt). `targets/widget/{generated.entitlements,Info.plist}` are regenerated
  each prebuild (gitignored).
- **appleTeamId:** not set in `app.json` (EAS sets the team per-target at build).
  To silence the apple-targets warning / build locally, add
  `ios.appleTeamId`. Keychain candidates on this machine: `2F8X334588`,
  `CN24UJRFFJ` (pick the team that owns the bundle id).

## Dev vs production environment — TEST ON DEV by default

Use the LOCAL/dev Supabase for ALL development and testing. Only switch to
production for an actual production/live deploy (App Store build or a prod OTA).

**ALWAYS check the LAN IP before launching the dev env.** The local Supabase
binds to the machine's LAN IP so a physical device can reach it; the IP changes
with the network, so verify it and update `.env` if it moved:
- Get it: `ipconfig getifaddr "$(route -n get default | awk '/interface:/{print $2}')"`
  (usually `en0`). Example seen: `192.168.1.6`.
- `.env` (gitignored — NEVER commit) must hold
  `EXPO_PUBLIC_SUPABASE_URL=http://<LAN-IP>:54321` + the LOCAL anon key. If the IP
  changed, update this line (and restart Metro so it re-inlines).

**Launch the dev env:**
1. `supabase start` (Docker must be up; stop split_bite first — it shares the
   default ports). DB → `:54322`, API/Kong → `:54321` (bound `0.0.0.0`, so the
   LAN IP works). Apply schema with `supabase db reset` (wipes local data, re-runs
   all migrations + seed) or `supabase migration up` (only pending migrations).
2. `supabase functions serve` — required for AI features (categorize / transcribe
   / ingest-sms); reads `supabase/functions/.env` (GROQ_API_KEY, gitignored).
3. `npx expo run:ios` — a local dev build (native modules — widget, datetimepicker,
   speech, App Intent — so Expo Go won't work). Metro inlines `EXPO_PUBLIC_*` from
   `.env`, pointing the app at the LAN-IP local Supabase.

**Switching to production / live — do NOT forget:** for a real deploy, use the
PRODUCTION values, never the local `.env`:
- OTA: inline the prod URL + anon key (see "OTA updates" above); prod project is
  `pzyadiwfjmjsafssxshc`.
- EAS production build: `eas.json` → `build.production.env` already holds prod values.
- Local prod build on a device (no EAS): `npm run build:prod:device`
  (`scripts/run-prod-ios.sh`) — bakes the prod env from `eas.json` into a local
  Release build for the connected iPhone; warns it hits live data, `-y` to skip.
- After shipping, point `.env` back at the LAN IP for the next dev run.

## Personal daily-driver app (real data) + OTA features — no EAS builds

The owner runs the app for real on their phone from a LOCAL build and ships
features via FREE OTA (EAS Update is not a build — it doesn't touch build credits).

- **Build once (and only when native code changes):** `npm run build:my-app`
  (`scripts/run-prod-ios.sh`) — a local Release build on the **`preview`** OTA
  channel, pointed at **prod** Supabase. The channel is baked in by
  `plugins/withLocalUpdateChannel.js`, gated on `LOCAL_UPDATE_CHANNEL` (a no-op
  for every EAS / production build, so it can't leak the channel into the store
  app). A local build has NO channel otherwise, so this is required for OTA.
- **Ship a JS/asset feature anytime:** `npm run ship -- "what changed"`
  (`scripts/ship-ota.sh`) → `eas update --branch preview` with prod env inlined.
  Reaches the personal phone on the next launch; does NOT touch the `production`
  channel / App Store users. FREE, no rebuild.
- **Native module added → rebuild** (`npm run build:my-app`) and bump the app
  `version` (runtimeVersion policy is `appVersion`) so old OTAs aren't served to
  the new native runtime.
- Signing persists via `ios.appleTeamId` (CN24UJRFFJ); see the device-build notes.
