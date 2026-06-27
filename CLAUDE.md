@AGENTS.md

## Workflow

- I do NOT need to review your implementation plan. After you write the plan,
  go straight to implementing it — don't pause to ask for plan approval.
- When I ask for something, do the analysis/planning and then IMMEDIATELY
  implement it. Do NOT stop to ask "want me to?" or for confirmation before
  building what I asked for — just build it (it's git-reversible). Default to
  action, not a confirmation prompt.

## Production database — pre-authorized (just show the migration)

- Prod DB pushes are **PRE-AUTHORIZED** (standing permission granted 2026-06-17).
  Do NOT stop to ask for confirmation before `supabase db push` / schema changes
  to the prod project `pzyadiwfjmjsafssxshc`. **Show the migration in your
  message first for visibility**, then push — no need to wait for a "go".
- Push with the linked project: `db push` does NOT take `--project-ref`; it uses
  the linked project. Use `SUPABASE_DB_PASSWORD=<db-pass> supabase db push --yes`.
  Migrations live in `supabase/migrations/`; only un-applied ones run. The DB
  password is in `supabase_credentials.md` (gitignored) — currently
  `car_sys12_pass@as`; never commit it.
- NOTE: the auto-mode safety classifier may still block a prod `db push` from
  Bash regardless of this rule — that guardrail is separate from CLAUDE.md and is
  lifted via a Bash permission rule in the user's settings (or the user runs the
  one-liner themselves). Still keep DESTRUCTIVE data changes (DELETE/UPDATE that
  drop or reassign rows) to a shown-first + explicit-ok flow.
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

## Android port — full setup + how it differs from iOS

Everything Android-native lives on branch **`feat/android`** (NOT merged to `main`,
which stays iOS-OTA-shippable). If picking this up cold, read this whole section.

### Identity — the package names DIFFER (intentional, do not "fix")
- **iOS** bundle id: `com.abdallah.masareef` (live on the App Store).
- **Android** package: **`com.masareef.budget`** — different on purpose (the Play
  app entry was created as `com.masareef.budget`; package names are invisible to
  users). `app.json` → `ios.bundleIdentifier=com.abdallah.masareef`,
  `android.package=com.masareef.budget`. The iOS **App Group** stays
  `group.com.abdallah.masareef`. Android-specific refs use the Android package:
  `androidCapture.ts` `OWN_PACKAGE`, `UpdateRequiredScreen` Play URLs.

### Signing — the big gotcha
- The Play app (`com.masareef.budget`) is enrolled in **Play App Signing** with the
  **upload key = the ORIGINAL EAS keystore, SHA-1 `4A:58:63:5E:56:AE:CA:A1:2B:88:E3:83:58:F5:94:A4:58:D3:A2:10`**
  (it got locked from the first upload attempt). After the package switch EAS
  generated a NEW keystore (`90:9C…`) for `com.masareef.budget`, which Play REJECTS.
- **Builds must sign with the `4A:58` keystore.** It's provided locally via
  `credentials.json` (gitignored) → `credentials/android/keystore.jks` + passwords
  (downloaded via `eas credentials`). To use it set
  `build.production.credentialsSource:"local"` in `eas.json` (keep this change
  UNCOMMITTED + per-build; it also forces iOS to local so only use it for
  `-p android` builds), or better: upload the `4A:58` keystore to EAS **remote**
  credentials for `com.masareef.budget` (`eas credentials -p android`).
- ✅ EAS **remote** credentials for `com.masareef.budget` were updated to the
  `4A:58` keystore (set as default), so a plain `eas build -p android --profile
  production` now signs correctly — no `credentials.json`/local override needed.
  (`credentials.json` + `credentials/android/keystore.jks` remain as a gitignored
  local backup.)
- Verify an AAB's signer: `unzip -oq app.aab -d x && keytool -printcert -file x/META-INF/*.RSA | grep SHA1`.

### Firebase / FCM (push)
- Firebase project `masareef-4fb61`. `google-services.json` (committed) contains
  BOTH packages. FCM V1 service-account key uploaded to EAS (push sender).
  `fcm-service-account.json` is gitignored.

### Bank-notification auto-capture = Android's version of the iOS SMS App Intent
- iOS: bank SMS → Shortcuts automation → "Log SMS to Masareef" App Intent → `ingest-sms`.
- Android: `react-native-android-notification-listener` (a NotificationListenerService)
  → **Headless JS task** registered in the custom entry **`index.js`** →
  `src/features/ingest/androidCapture.ts` forwards notifications whose text matches
  a user keyword to the SAME `ingest-sms` endpoint. Has a 90s dedup + ignores our
  OWN package (avoids a feedback loop from our "transaction logged" push). Settings
  UI: `AndroidCaptureSection` (Settings → Bank Notification Capture). The capture
  token is minted fresh on enable; `ensureIngestToken` (iOS Keychain mirror) is
  iOS-only-guarded so it can't revoke the Android token.
- The lib is patched via **patch-package** (`patches/react-native-android-notification-listener+5.0.1.patch`)
  for AGP 8 (adds Gradle `namespace`, drops deprecated manifest `package` +
  `allowBackup`). `.npmrc` has `legacy-peer-deps=true` (lib peers react@18);
  `postinstall: patch-package`. `plugins/withAndroidPermissionCleanup.js` strips
  `READ_PHONE_STATE` (lib adds it; Play sensitive permission we don't use).

### Sign-in providers differ by platform
- iOS = **Apple** (`expo-apple-authentication`). Android = **native Google**
  (`@react-native-google-signin/google-signin` → `signInWithGoogle` in
  `socialAuth.ts` → `supabase.auth.signInWithIdToken`). Google is Android-only (its
  iOS pod build is unresolved). `SocialAuthButtons` shows Apple on iOS, Google on Android.
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 528169201740-b86bngtnrhl579saff5npg7liqrapefp.apps.googleusercontent.com`
  (the **Web** OAuth client = the idToken audience; per-project, same for both
  packages). In `.env` (local) + `eas.json` prod/preview env. The google-signin
  config plugin requires a placeholder `iosUrlScheme` (Android ignores it).
- Google sign-in also needs the **Android OAuth client** (package + signing SHA-1)
  in Google Cloud — created by adding SHA-1s to the Firebase `com.masareef.budget`
  app. Add BOTH: the upload key (`4A:58…`) AND the **Play App Signing key SHA-1**
  (Play Console → App integrity → App signing) — the latter is what Play-distributed
  installs run.
- Supabase Google provider: LOCAL `supabase/config.toml` `[auth.external.google]`
  (client_id=web id, `secret=""`, `skip_nonce_check=true`) — kept UNCOMMITTED
  local-dev. PROD: enable Google in the Supabase dashboard (web client id + secret).
  (`config.toml` `enable_confirmations=false` is also a local-dev convenience, uncommitted.)

### Play Store
- App `com.masareef.budget`, **internal testing** track. `eas submit` wired:
  `eas.json submit.production.android` (track internal, `serviceAccountKeyPath
  ./play-service-account.json` — gitignored). Service account
  `play-publisher@masareef-4fb61.iam.gserviceaccount.com` has Release in Play
  Console; **Google Play Android Developer API** enabled in the Cloud project.
- The FIRST upload had to be MANUAL (Google rule); afterwards
  `eas submit -p android --profile production --latest` works.
- Listing assets in `store-assets/play/` (icon-512, feature-graphic-1024x500,
  screenshots). Legal pages served from the repo's **gh-pages** branch:
  `https://abdallah-hatem.github.io/budget_tracker/privacy.html` (covers
  notification access) + `/delete-account.html`. Demo review account
  `review@masareef.app` (password in gitignored `credentials.md`).

### Android build / OTA
- Prod AAB: `eas build -p android --profile production` (app-bundle, channel
  `production`, prod env incl. `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`). dev/preview = apk;
  `development` profile needs `expo-dev-client`.
- OTA: `eas update --branch production --platform android` with prod env inlined
  (same rule as iOS — inline prod URL + anon + GOOGLE_WEB_CLIENT_ID). **Scope to
  `--platform android`** so the shared `production` channel doesn't push
  feat/android JS to iOS clients.
- EAS free-plan build quota is **per-platform** (iOS and Android count separately).
- Forced-update gate is per-platform: `app_config.min_android_version` (migration
  0017, prod = `0.0.0` = nobody blocked). `UpdateRequiredScreen` Android URL =
  `market://details?id=com.masareef.budget`.

### Local Android dev + emulator
- Android SDK at `~/Library/Android/sdk` (`ANDROID_HOME` + PATH in `~/.zshrc`):
  cmdline-tools, platform-tools, emulator, build-tools 35, platform android-35.
- AVDs: `Pixel7_API35` (google_apis) and **`Pixel7_Play`** (google_apis_playstore —
  needed to add a real Google account to test Google sign-in). `hw.keyboard=yes` set
  in each AVD's `config.ini` (else the Mac keyboard can't type).
- Emulator ↔ host: `adb reverse tcp:8081 tcp:8081` + `adb reverse tcp:54321 tcp:54321`,
  and run Metro with `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`. Open dev
  client: `adb shell am start -a android.intent.action.VIEW -d
  "masareef://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`. Expo Go:
  `exp://127.0.0.1:8081` (note: native modules — Google sign-in, notification
  listener — DON'T work in Expo Go; use the dev-client build).
- Long-lived processes (emulator, Metro) are flaky as harness background tasks —
  launch them in a visible Terminal via `osascript` so they survive.

### Keyboard handling (Android)
- `automaticallyAdjustKeyboardInsets` (the ScrollView prop) is **iOS-only**. Android
  needs `KeyboardAvoidingView behavior="padding"` — applied in `Screen` (scroll),
  the auth screens, and the capture/manual/type sheets.
