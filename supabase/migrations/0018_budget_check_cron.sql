-- ---------------------------------------------------------------------------
-- Schedule the daily budget-check Edge Function via pg_cron + pg_net.
-- Every step is exception-safe so the migration never fails in an environment
-- without the extensions (matches 0013_purge_raw_text.sql).
--
-- The service-role key is read from Vault rather than inlined here, so it never
-- lands in migration history. Set it once per project:
--   select vault.create_secret('<service-role-key>', 'service_role_key');
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
                         where name = 'service_role_key' limit 1)
                   ),
        body    := '{}'::jsonb
      );
    $job$
  );
exception when others then null;
end $$;
