-- 0003_push_tokens.sql — Phase 2: push notification tokens for Expo
-- Stores one or more Expo push tokens per user (multi-device support).
-- The ingest-sms Edge Function reads tokens via the service-role key (bypasses RLS).

-- ---------------------------------------------------------------------------
-- push_tokens : Expo push tokens per user
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users (id) on delete cascade,
  token       text        not null unique,
  platform    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.push_tokens enable row level security;

create policy "push_tokens_select_own"
  on public.push_tokens for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "push_tokens_update_own"
  on public.push_tokens for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  to authenticated
  using ( (select auth.uid()) = user_id );
