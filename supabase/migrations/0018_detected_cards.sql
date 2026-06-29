-- 0018_detected_cards.sql — auto-detected cards/accounts for SMS capture.
--
-- Replaces the "manage keywords" model with "manage Cards": ingest-sms parses a
-- card/account fingerprint from each bank message and groups transactions under
-- a Card the user can rename, enable, or disable. A disabled card's messages are
-- discarded server-side. Cards are SMS-grouping metadata only in v1 — they are
-- NOT linked to balance `accounts` (that is a future enrichment).

create table public.detected_cards (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  fingerprint  text        not null,           -- stable per-user key, e.g. 'acct:8889'
  label        text,                            -- user-editable; auto-filled on detect
  enabled      boolean     not null default true,  -- Decision A: new cards auto-on
  last_seen_at timestamptz,
  txn_count    integer     not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, fingerprint)
);

create index detected_cards_user_id_idx on public.detected_cards (user_id);

-- transactions.card_id : which detected card a captured txn belongs to (nullable;
-- only set for source='sms'). on delete set null so deleting a card keeps history.
alter table public.transactions
  add column card_id uuid references public.detected_cards (id) on delete set null;
create index transactions_card_idx on public.transactions (card_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security — owner manages their own cards. ingest-sms writes via the
-- service-role client (bypasses RLS), exactly like transactions today.
-- ---------------------------------------------------------------------------
alter table public.detected_cards enable row level security;

create policy "detected_cards_select_own"
  on public.detected_cards for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "detected_cards_insert_own"
  on public.detected_cards for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "detected_cards_update_own"
  on public.detected_cards for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "detected_cards_delete_own"
  on public.detected_cards for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

-- ---------------------------------------------------------------------------
-- RPC: bump_detected_card — atomically increment txn_count + set last_seen_at.
-- Called by ingest-sms (service role) on a repeat hit of an existing card, so
-- concurrent captures don't lose counter increments. SECURITY DEFINER so it can
-- run under the service-role context; hardened with an empty search_path.
-- ---------------------------------------------------------------------------
create or replace function public.bump_detected_card(p_id uuid, p_seen timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.detected_cards
     set txn_count = txn_count + 1,
         last_seen_at = p_seen
   where id = p_id;
$$;
