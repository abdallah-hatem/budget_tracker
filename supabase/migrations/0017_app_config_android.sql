-- Per-platform forced-update floor. Android gets its own minimum version so the
-- gate can force Android updates independently of iOS. Default '0.0.0' so no
-- Android user is ever blocked until this is deliberately raised.
alter table public.app_config
  add column if not exists min_android_version text not null default '0.0.0';
