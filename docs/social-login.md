# Google + Apple sign-in

Lets users sign in with Google or Apple. **No SMTP needed** — the provider has
already verified the email, so Supabase trusts it and sends no confirmation
email (unlike password sign-up). This is the cleanest path to verified accounts.

**App Store rule:** offering Google sign-in *requires* offering Sign in with
Apple too. Both are implemented.

**Native modules → needs a build.** `expo-apple-authentication` and
`@react-native-google-signin/google-signin` are native, so this ships with the
next EAS/local build (bundles with subscriptions + Sentry) — **not OTA-able**.

## How it works (code)

- `src/features/auth/socialAuth.ts` — `signInWithApple()` / `signInWithGoogle()`:
  get the provider identity token → `supabase.auth.signInWithIdToken({ provider, token })`.
  Lazy/guarded so Expo Go / web / jest don't crash; on success the
  SessionProvider's `onAuthStateChange` drives navigation (same as password).
- `src/features/auth/SocialAuthButtons.tsx` — native Apple button (required style)
  + Google button; shown on both sign-in and sign-up. Auto-hides a provider
  that isn't configured/available.

## External setup (YOU — can't be coded)

### Google (Google Cloud Console → APIs & Services → Credentials)
1. Create an **OAuth 2.0 Client ID → iOS** (bundle id `com.abdallah.masareef`).
   Copy its **reversed client id** (`com.googleusercontent.apps.123-abc`).
2. Create an **OAuth 2.0 Client ID → Web application**. Copy the **Web client id**
   + **secret** (Supabase needs these; the app needs the Web client id as
   `webClientId` so the idToken audience matches).
3. **Supabase dashboard** → Authentication → Providers → **Google** → enable, paste
   the **Web** client id + secret. (Add the iOS client id under "Authorized Client
   IDs" too.)

### Apple (Apple Developer)
1. App ID `com.abdallah.masareef` → enable the **Sign In with Apple** capability.
   (`ios.usesAppleSignIn: true` in app.json already requests the entitlement.)
2. For server-side token verification: create a **Services ID** + **key**, then
   **Supabase dashboard** → Authentication → Providers → **Apple** → enable and
   fill in the Services ID / Team ID / Key. For the native iOS identity-token flow,
   add `com.abdallah.masareef` to the provider's **Authorized Client IDs**.

### Wire the keys into the app build
Put these in the build env (eas.json prod env + local `.env`):
```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<web client id>.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=<ios client id>.apps.googleusercontent.com
```
And in **app.json**, replace the placeholder in the google-signin plugin:
```
"iosUrlScheme": "com.googleusercontent.apps.<reversed ios client id>"
```

## Build & test
- Native module → fresh build: `npm run build:my-app` (bundles with subscriptions
  + Sentry). Bump `version`.
- Can't be tested in Expo Go or the simulator reliably — test the real flow on a
  device build with a real Google/Apple account.
- Local Supabase: the `[auth.external.google|apple]` blocks in `config.toml` are
  disabled; native social sign-in is normally tested against the **prod** project
  (providers configured in the dashboard). If testing Google locally, enable the
  block and set `skip_nonce_check = true`.
