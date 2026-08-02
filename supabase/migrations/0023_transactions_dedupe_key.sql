-- 0023_transactions_dedupe_key.sql
-- Make SMS/notification ingestion idempotent.
--
-- The same bank message can reach ingest-sms twice: an iOS Shortcuts personal
-- automation whose filters match one sender through two rules fires twice, and
-- Android's NotificationListener re-delivers a notification when it is updated
-- or bundled. Seen in production as two POSTs 16-160 ms apart with identical
-- text -> two identical pending transactions.
--
-- The two copies are CONCURRENT, so a read-then-write guard in the function
-- cannot catch them. The unique index below is the authority: the second copy
-- hits ON CONFLICT DO NOTHING and is dropped.

alter table public.transactions
  add column if not exists dedupe_key text;

comment on column public.transactions.dedupe_key is
  'sha256 of the whitespace-normalised captured message. Set by ingest-sms only; '
  'null for manual/voice entries. Unique per user so a re-delivered message '
  'cannot create a second row.';

-- Deliberately NOT a partial index: Postgres treats NULLs as distinct, so every
-- pre-existing row and every manually-entered transaction (dedupe_key null)
-- remains unconstrained. A full index is also required for PostgREST's
-- `on_conflict=user_id,dedupe_key` arbiter inference to resolve, which a
-- partial index would not satisfy without a matching WHERE clause.
create unique index if not exists transactions_user_dedupe_key_idx
  on public.transactions (user_id, dedupe_key);
