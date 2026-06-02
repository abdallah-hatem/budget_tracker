-- 0002_ingest_tokens.sql — Phase 2: SMS auto-capture token table + RPCs
-- pgcrypto is already installed in the extensions schema; the CREATE IF NOT EXISTS
-- is a no-op but keeps the migration self-documenting.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- ingest_tokens : one revocable bearer token per user for the SMS ingest edge fn
-- ---------------------------------------------------------------------------
create table public.ingest_tokens (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  token_hash   text        not null unique,  -- sha256(raw_token) hex; raw NEVER stored
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked      boolean     not null default false
);

create index ingest_tokens_user_id_idx on public.ingest_tokens (user_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.ingest_tokens enable row level security;

create policy "ingest_tokens_select_own"
  on public.ingest_tokens for select
  to authenticated
  using ( (select auth.uid()) = user_id );

create policy "ingest_tokens_insert_own"
  on public.ingest_tokens for insert
  to authenticated
  with check ( (select auth.uid()) = user_id );

create policy "ingest_tokens_update_own"
  on public.ingest_tokens for update
  to authenticated
  using ( (select auth.uid()) = user_id )
  with check ( (select auth.uid()) = user_id );

create policy "ingest_tokens_delete_own"
  on public.ingest_tokens for delete
  to authenticated
  using ( (select auth.uid()) = user_id );

-- ---------------------------------------------------------------------------
-- RPC: create_ingest_token
-- Returns the raw (unhashed) bearer token exactly once.
-- Revokes any existing active tokens for the caller before issuing a new one.
-- SECURITY DEFINER + empty search_path for hardening.
-- ---------------------------------------------------------------------------
create or replace function public.create_ingest_token()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw  text;
begin
  -- Revoke all existing active tokens for this user.
  update public.ingest_tokens
  set    revoked = true
  where  user_id = auth.uid()
    and  revoked = false;

  -- Generate a URL-safe base64 token from 32 random bytes (≈43 chars, no padding issues).
  raw := replace(
           replace(
             encode(extensions.gen_random_bytes(32), 'base64'),
             '+', '-'),
           '/', '_');

  -- Store only the sha256 hash; raw is returned to caller and never persisted.
  insert into public.ingest_tokens (user_id, token_hash)
  values (auth.uid(), encode(extensions.digest(raw, 'sha256'), 'hex'));

  return raw;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: revoke_ingest_tokens
-- Marks all of the caller's tokens as revoked (e.g. on logout / key rotation).
-- ---------------------------------------------------------------------------
create or replace function public.revoke_ingest_tokens()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ingest_tokens
  set    revoked = true
  where  user_id = auth.uid()
    and  revoked = false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function public.create_ingest_token()  to authenticated;
grant execute on function public.revoke_ingest_tokens() to authenticated;
