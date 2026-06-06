-- 0007_sms_rules.sql — per-user keyword rules for SMS auto-categorization.
-- When an incoming bank SMS contains a rule's keyword, the ingest-sms function
-- overrides the AI's category (and note, when set) with the rule's. Owner-only.

create table public.sms_rules (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  keyword       text not null check (length(btrim(keyword)) > 0),
  category_slug text not null references public.categories (slug),
  note          text,
  created_at    timestamptz not null default now()
);

alter table public.sms_rules enable row level security;

-- Owner-only: a user can see/insert/update/delete only their own rules. The
-- ingest-sms Edge Function reads these with the service role (RLS bypassed) and
-- filters by the token-resolved user_id explicitly.
create policy "sms_rules are owner-only"
  on public.sms_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index sms_rules_user_idx on public.sms_rules (user_id);
