-- Privacy / data-minimization for transactions.raw_text (the original bank SMS
-- or voice/typed text). It is only needed while a transaction is `pending`
-- (shown on the review screen so the user can verify before confirming). Once
-- confirmed it is never read again, so we must not retain it.

-- 1) Enforce at the DB layer for EVERY write path (capture auto-add, pending
--    confirm, edit-confirm): a confirmed transaction never keeps raw_text.
create or replace function public.clear_raw_text_on_confirm()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'confirmed' then
    new.raw_text := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clear_raw_text_on_confirm on public.transactions;
create trigger trg_clear_raw_text_on_confirm
  before insert or update on public.transactions
  for each row execute function public.clear_raw_text_on_confirm();

-- 2) Backfill: purge raw_text already stored on existing confirmed rows.
update public.transactions
set raw_text = null
where status = 'confirmed' and raw_text is not null;

-- 3) Retention: clear raw_text from abandoned pending rows (> 7 days) daily.
--    Each step is wrapped in its own exception-safe block so the migration never
--    fails if pg_cron is unavailable in an environment — the trigger + backfill
--    above are the hard guarantees; the cron is best-effort cleanup.
do $$ begin execute 'create extension if not exists pg_cron'; exception when others then null; end $$;
do $$ begin perform cron.unschedule('purge-stale-pending-raw-text'); exception when others then null; end $$;
do $$
begin
  perform cron.schedule(
    'purge-stale-pending-raw-text',
    '0 3 * * *',
    $job$update public.transactions
           set raw_text = null
         where status = 'pending'
           and raw_text is not null
           and created_at < now() - interval '7 days'$job$
  );
exception when others then null;
end $$;
