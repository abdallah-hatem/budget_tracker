# Sentry — error & crash monitoring

Catch-all crash/error monitoring for Masareef, complementing the AI-specific
`ai_events` table (see migration `0009_ai_events.sql` + `_shared/aiEvents.ts`).

## DSN (not a secret — safe to embed in clients / commit)

```
https://12c185ba8d40fa1825fe2cc119a3c757@o4511552801144832.ingest.de.sentry.io/4511552817594448
```

- **Region:** EU (`ingest.de.sentry.io`).
- **Org:** `o4511552801144832` · **Project:** `4511552817594448`.
- A DSN is a public client key — it only allows *sending* events, not reading
  them, so embedding it in the app bundle and committing it here is fine.

## Where it's wired

- **App (`@sentry/react-native`):** `Sentry.init({ dsn })` at app entry; native
  crash reporting needs an EAS/local **rebuild** (native module). Read from
  `EXPO_PUBLIC_SENTRY_DSN` (falls back to the literal above).
- **Edge functions (`@sentry/deno`):** `categorize` / `transcribe` / `ingest-sms`
  capture exceptions server-side. DSN read from the `SENTRY_DSN` secret
  (`supabase secrets set SENTRY_DSN=... --project-ref pzyadiwfjmjsafssxshc`);
  no DSN set in local dev → Sentry is a no-op.

## Two layers, on purpose

| Layer | Catches | Where to look |
|---|---|---|
| `ai_events` table | Groq/Whisper failures, latency, low confidence, empty parses | Supabase dashboard SQL |
| Sentry | Any unhandled crash/exception (app + edge), stack traces | Sentry dashboard (EU) |
