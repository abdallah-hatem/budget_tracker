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
