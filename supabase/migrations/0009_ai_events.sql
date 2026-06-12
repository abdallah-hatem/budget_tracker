-- 0009_ai_events.sql — observability for the AI pipeline.
-- The categorize / transcribe / ingest-sms Edge Functions write one row per call
-- (service role) so we can spot failure rates, latency, confidence drops, and
-- Groq errors. NO raw user text is stored (privacy) — only metrics + the error
-- message. Locked to the service role; query it from the dashboard.

create table public.ai_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users (id) on delete set null,
  fn           text not null,        -- 'categorize' | 'transcribe' | 'ingest-sms'
  source       text,                 -- 'voice' | 'text' | 'sms'
  model        text,
  ok           boolean not null,
  error        text,                 -- error message when ok = false
  latency_ms   integer,
  confidence   numeric(3, 2),        -- lowest parsed-item confidence (0..1)
  input_len    integer,              -- chars of input text / transcript
  result_count integer,              -- number of parsed transactions
  created_at   timestamptz not null default now()
);

create index ai_events_created_idx on public.ai_events (created_at desc);
create index ai_events_fn_ok_idx on public.ai_events (fn, ok);

-- Only the service role (Edge Functions) writes; the dashboard (admin) reads.
-- RLS on + no policies => no access for authenticated/anon users.
alter table public.ai_events enable row level security;
