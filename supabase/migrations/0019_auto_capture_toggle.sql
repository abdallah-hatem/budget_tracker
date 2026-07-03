-- 0019_auto_capture_toggle.sql
-- Global per-user master switch to pause SMS auto-capture.
--
-- When false, `ingest-sms` discards every forwarded message (server-side gate),
-- even though the iOS Shortcut / Android listener keep forwarding — so the user
-- can turn capture off without tearing down their automation. Defaults true so
-- existing users are unaffected.
alter table public.profiles
  add column if not exists auto_capture_enabled boolean not null default true;
