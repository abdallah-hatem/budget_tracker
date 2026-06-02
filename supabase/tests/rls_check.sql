-- supabase/tests/rls_check.sql
-- Proves transactions RLS isolation: user B and anon cannot read user A's rows.
-- Run with:  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_check.sql
-- Wrapped in a transaction + rollback so it leaves no residue.
--
-- DB_URL (local dev): postgresql://postgres:postgres@127.0.0.1:54322/postgres
-- Via docker exec:
--   docker exec supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 \
--     -f /path/to/supabase/tests/rls_check.sql

begin;

-- Two fake auth users (insert directly as superuser; the on_auth_user_created
-- trigger will also create their profiles rows).
insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev');

-- Seed one transaction owned by user A (insert as superuser, bypasses RLS).
insert into public.transactions (user_id, type, amount, category_slug, source, status)
values ('00000000-0000-0000-0000-00000000000a', 'expense', 50.00, 'food', 'text', 'confirmed');

-- ---- Impersonate user B (authenticated role + B's JWT claims) ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}';

do $$
declare visible int;
begin
  select count(*) into visible from public.transactions;
  assert visible = 0, format('FAIL: user B can see %s of user A''s transactions (expected 0)', visible);
  raise notice 'PASS: user B sees 0 of user A''s transactions';
end $$;

reset role;

-- ---- Impersonate anon (no JWT) ----
set local role anon;
set local request.jwt.claims = '';

do $$
declare visible int;
begin
  select count(*) into visible from public.transactions;
  assert visible = 0, format('FAIL: anon can see %s transactions (expected 0)', visible);
  raise notice 'PASS: anon sees 0 transactions';

  -- anon CAN read categories (read-only reference data).
  select count(*) into visible from public.categories;
  assert visible = 17, format('FAIL: anon sees %s categories (expected 17)', visible);
  raise notice 'PASS: anon can read 17 categories';
end $$;

reset role;

-- ---- Confirm user A still sees their own row ----
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}';

do $$
declare visible int;
begin
  select count(*) into visible from public.transactions;
  assert visible = 1, format('FAIL: user A sees %s of their own transactions (expected 1)', visible);
  raise notice 'PASS: user A sees their own 1 transaction';
end $$;

reset role;

rollback;  -- leave the DB clean
