-- 1.2.0 is live on the App Store — raise the minimum supported version so
-- users still on 1.1.1 get the forced "Update required" screen on next open.
update public.app_config set min_ios_version = '1.2.0', updated_at = now() where id = 1;
