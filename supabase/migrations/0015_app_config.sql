-- Remote app config for the forced-update gate. A single row holds the minimum
-- iOS app version the client must be on; the app compares its installed version
-- and blocks with an "update required" screen when it's below this. Readable by
-- everyone (the gate runs before/around auth); only the service role / dashboard
-- can change it (no write policies).
create table if not exists public.app_config (
  id              int primary key default 1 check (id = 1),
  min_ios_version text not null default '0.0.0',
  updated_at      timestamptz not null default now()
);

-- Seed with the currently shipped version so NO existing user is blocked. Raise
-- this only after a newer build is live on the App Store.
insert into public.app_config (id, min_ios_version)
values (1, '1.1.1')
on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists "app_config_read" on public.app_config;
create policy "app_config_read"
  on public.app_config for select
  to anon, authenticated
  using (true);
