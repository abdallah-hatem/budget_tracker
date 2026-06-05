@AGENTS.md

## Workflow

- I do NOT need to review your implementation plan. After you write the plan,
  go straight to implementing it — don't pause to ask for plan approval.
- When I ask for something, do the analysis/planning and then IMMEDIATELY
  implement it. Do NOT stop to ask "want me to?" or for confirmation before
  building what I asked for — just build it (it's git-reversible). Default to
  action, not a confirmation prompt.

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
