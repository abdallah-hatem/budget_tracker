-- Remove the daily pending raw_text purge cron added in 0013. The BEFORE
-- INSERT/UPDATE trigger (clear_raw_text_on_confirm) remains the guarantee that
-- confirmed transactions never retain raw_text; abandoned pending rows now keep
-- their raw_text until they are reviewed or deleted.
do $$ begin perform cron.unschedule('purge-stale-pending-raw-text'); exception when others then null; end $$;
