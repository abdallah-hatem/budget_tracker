# Email verification on sign-up

New accounts must confirm their email before they can sign in. Required now that
the app is live on the App Store (stops fake/typo'd emails creating accounts).

## How it works

- **Supabase** withholds the session at sign-up until the email is confirmed
  (`enable_confirmations`). `supabase.auth.signUp` returns a user but **no
  session**, and a "Confirm Your Email" message is sent.
- **App** (`app/(auth)/sign-up.tsx`): on a no-session signup it switches to a
  **verify-your-email** view (shows the address, a 60s-cooldown **Resend**, and
  "Back to sign in"). The user taps the link in the email, returns, and signs in.
- **App** (`app/(auth)/sign-in.tsx`): a sign-in attempt before confirming returns
  `error_code: email_not_confirmed` → a friendly message + inline **Resend**.

No deep-linking needed: confirmation happens in the browser, then the user signs
in normally. (A future enhancement could deep-link `masareef://` to auto-sign-in.)

## Enabling it

- **Local:** `supabase/config.toml` → `[auth.email] enable_confirmations = true`
  (already set). Apply with `supabase stop && supabase start`. Confirmation
  emails land in **Mailpit** at http://127.0.0.1:54324.
- **Prod (REQUIRED — the app change alone does nothing):** Supabase dashboard →
  **Authentication → Sign In / Providers → Email → "Confirm email" = ON** for
  project `pzyadiwfjmjsafssxshc`. Also make sure the email **rate limit**
  (~60s) matches the app's 60s resend cooldown, and that a real SMTP sender is
  configured (the built-in sender is heavily throttled — use a custom SMTP for
  production volume).

## Shipping

App side is **pure JS → OTA-able** (no native build): `npm run ship -- "email
verification"`. But it's inert until the dashboard toggle above is ON, so flip
that first (or together).
