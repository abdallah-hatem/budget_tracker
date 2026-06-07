-- 0008_soft_delete_account.sql — soft-delete a user account.
-- Marks the profile as deleted (the row + all the user's data are RETAINED, so
-- it's recoverable by an admin); the app's SessionProvider gate refuses any
-- session whose profile is soft-deleted, so the user can't sign back in.

alter table public.profiles
  add column if not exists deleted_at timestamptz;

-- RPC: the signed-in user soft-deletes their OWN account. security invoker so the
-- update runs under the caller and the existing owner-only RLS on profiles applies
-- (a user can only ever flag their own row).
create or replace function public.soft_delete_account()
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.profiles
     set deleted_at = now()
   where id = (select auth.uid())
     and deleted_at is null;
end;
$$;

grant execute on function public.soft_delete_account() to authenticated;
