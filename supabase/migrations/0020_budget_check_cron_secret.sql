-- ---------------------------------------------------------------------------
-- Reschedule budget-check to authenticate with a DEDICATED secret.
--
-- 0018 sent the service-role key as the bearer, matched against the platform's
-- auto-injected SUPABASE_SERVICE_ROLE_KEY. That value is not reliably identical
-- to the key the CLI reports, so the function rejected its own cron job (401).
-- The endpoint now runs with verify_jwt = false and gates on BUDGET_CHECK_SECRET
-- instead — the same self-authenticating pattern ingest-sms uses. Set once per
-- project (both must hold the SAME value):
--   supabase secrets set BUDGET_CHECK_SECRET=<value>
--   select vault.create_secret('<value>', 'budget_check_secret');
-- ---------------------------------------------------------------------------
do $$ begin execute 'create extension if not exists pg_cron'; exception when others then null; end $$;
do $$ begin execute 'create extension if not exists pg_net'; exception when others then null; end $$;

do $$ begin perform cron.unschedule('budget-check-daily'); exception when others then null; end $$;

do $$
begin
  perform cron.schedule(
    'budget-check-daily',
    '0 3 * * *',
    $job$
      select net.http_post(
        url     := 'https://pzyadiwfjmjsafssxshc.supabase.co/functions/v1/budget-check',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'Authorization', 'Bearer ' ||
                       (select decrypted_secret from vault.decrypted_secrets
                         where name = 'budget_check_secret' limit 1)
                   ),
        body    := '{}'::jsonb
      );
    $job$
  );
exception when others then null;
end $$;
