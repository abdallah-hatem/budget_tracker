-- supabase/tests/accounts_check.sql
-- Proves: default-account trigger, account_balances math (confirmed only),
-- set_default_account single-default invariant, delete -> account_id null,
-- and accounts RLS isolation. Wrapped in a txn + rollback (no residue).
-- Run: docker exec supabase_db_budget_tracker psql -U postgres -v ON_ERROR_STOP=1 \
--        -f /tmp/accounts_check.sql
begin;

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'acct-a@test.dev');
-- handle_new_user already created a default 'Main' account for this user.

do $$
declare def_id uuid; n int; bal numeric;
begin
  select id into def_id from public.accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1' and is_default;
  assert def_id is not null, 'FAIL: new user has no default account';

  -- Trigger fills account_id from the default when null.
  insert into public.transactions (user_id, type, amount, category_slug, source, status)
  values ('00000000-0000-0000-0000-0000000000a1', 'expense', 100.00, 'food', 'text', 'confirmed');
  select count(*) into n from public.transactions
    where user_id = '00000000-0000-0000-0000-0000000000a1' and account_id = def_id;
  assert n = 1, 'FAIL: trigger did not assign default account_id';
  raise notice 'PASS: trigger assigns default account';

  -- Balance view: opening(0) + income(500) - expense(100) = 400 (pending excluded).
  insert into public.transactions (user_id, type, amount, category_slug, source, status, account_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'income', 500.00, 'salary', 'text', 'confirmed', def_id),
         ('00000000-0000-0000-0000-0000000000a1', 'expense', 999.00, 'food', 'sms', 'pending', def_id);
  select balance into bal from public.account_balances where id = def_id;
  assert bal = 400.00, format('FAIL: balance %s expected 400.00', bal);
  raise notice 'PASS: balance excludes pending, sums confirmed';

  -- A provided account_id is preserved (trigger only fills when null).
  insert into public.accounts (id, user_id, name, opening_balance, is_default)
  values ('00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000a1', 'Cash', 0, false);
  insert into public.transactions (user_id, type, amount, category_slug, source, status, account_id)
  values ('00000000-0000-0000-0000-0000000000a1', 'expense', 10.00, 'food', 'text', 'confirmed',
          '00000000-0000-0000-0000-0000000000c1');
  select count(*) into n from public.transactions
    where account_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 1, 'FAIL: explicit account_id overwritten by trigger';
  raise notice 'PASS: explicit account_id preserved';

  -- set_default_account moves the single default flag.
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
  perform public.set_default_account('00000000-0000-0000-0000-0000000000c1');
  set local role postgres;
  select count(*) into n from public.accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1' and is_default;
  assert n = 1, format('FAIL: %s default accounts after flip (expected 1)', n);
  perform 1 from public.accounts
    where id = '00000000-0000-0000-0000-0000000000c1' and is_default;
  assert found, 'FAIL: target account is not default after flip';
  raise notice 'PASS: set_default_account keeps exactly one default';

  -- Deleting an account nulls its transactions account_id (SET NULL).
  delete from public.accounts where id = '00000000-0000-0000-0000-0000000000c1';
  select count(*) into n from public.transactions
    where account_id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 0, 'FAIL: deleted account left dangling account_id';
  raise notice 'PASS: delete account -> txn account_id null';
end $$;

-- RLS isolation: user B cannot see user A's accounts.
insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000b1',
        '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'acct-b@test.dev');
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$
declare visible int;
begin
  select count(*) into visible from public.accounts
    where user_id = '00000000-0000-0000-0000-0000000000a1';
  assert visible = 0, format('FAIL: user B sees %s of user A accounts', visible);
  raise notice 'PASS: accounts RLS isolates users';
end $$;
set local role postgres;

rollback;
